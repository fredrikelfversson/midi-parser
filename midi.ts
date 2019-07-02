import BytesParser from "./parser";
import * as Types from "./types";

export function parseMidi(midiByteBuffer: ArrayBuffer): Types.MidiFileData {
    var parser = new BytesParser(midiByteBuffer);

    let header = parseFileHeader(parser.parseChunk());
    let tracks: Types.Track[] = [];

    while(!parser.eof()) {
        let track = parseTrack(parser.parseChunk());
        tracks.push(track);
    }

    return { header, tracks }
}

function parseFileHeader(Chunk: Types.Chunk): Types.MidiHeader {
    if (Chunk.id !== "MThd") { throw new Error("Not a valid MIDI-file, file header is invalid") };
    
    let parser = new BytesParser(Chunk.data);
    let formatType: number = parser.parseU16();
    let trackAmount: number = parser.parseU16();
    let timeDivision: number = parser.parseU16();

    return { id: Chunk.id, size: Chunk.size, formatType, trackAmount, timeDivision }
}

function parseTrack(Chunk: Types.Chunk): Types.Track {
    if (Chunk.id !== "MTrk") { throw new Error("Not a valid MIDI-file, track header is invalid") };
    
    let trackChunkSize = Chunk.size;
    let parser = new BytesParser(Chunk.data);
    let events: Types.TrackEvent[] = [];
    let lastStatusByte: Types.Nullable<number> = null;
    let absoluteTime: number = 0;
    let tempo: number = 0;

    //Each loop is one new event in the track
    while(!parser.eof()) {
        let deltaTime: number = parser.parseVLQ();
        let statusByte: number = parser.parseU8();

        absoluteTime += deltaTime;

        switch (statusByte) {
            //SYSEX-EVENT
            case 0xf0:
            case 0xf7:
                let sysexSize: number = parser.parseVLQ();
                let sysexBytes: number[] = parser.parseBytes(sysexSize);  
                let sysexEvent: Types.TrackEvent = parseSysexEvent({ deltaTime, absoluteTime, sysexType: statusByte, bytes: sysexBytes });
                
                events.push(sysexEvent)
                break;
            //META-EVENT
            case 0xff:
                let metaType: number = parser.parseU8();
                let metaSize: number = parser.parseVLQ();
                let metaBytes: number[] = parser.parseBytes(metaSize);
                let metaEvent: Types.TrackEvent = parseMetaEvent({ deltaTime, absoluteTime, metaType, size: metaSize, bytes: metaBytes });
                
                if(metaEvent.type === "setTempo") { tempo = (<Types.MetaTempoEvent>metaEvent).msPerQuarterNote };
                
                events.push(metaEvent);
                
                break;
            //MIDI-EVENT | RUNNING STATUS | UNKNOWN EVENT
            default:
                let p1: Types.Nullable<number> = null;
                let p2: Types.Nullable<number> = null;

                // if eventType is not an actual midi status byte then running status is assumed.
                if (isRunningStatus(statusByte)) {
                    if (lastStatusByte === null) { throw new Error("Running Status Byte already initialized") }
                    //No status byte exists, thus message is one byte shorter.
                    parser.decPos(1);
                    statusByte = lastStatusByte;
                } else {
                    lastStatusByte = statusByte;
                }
                p1 = parser.parseU8();

                let [midiType, channel] = midiChannelAndType(statusByte);
                
                if (twoParametersRequired(midiType)) { p2 = parser.parseU8() };

                let midiEvent = parseMidiEvent({ deltaTime, absoluteTime, midiType, channel, p1, p2 });
                events.push(midiEvent);
                
                break;        
        }
    }

    if (trackChunkSize !== parser.checkSum) { 
        throw new Error("Expected track size is not equal to actual track size: " + parser.checkSum + "/" + trackChunkSize ); 
    }
    
    return { id: Chunk.id, size: Chunk.size, ticksDuration: absoluteTime, tempo, events };
}

function parseMetaEvent(data: Types.GenericMetaEvent): Types.TrackEvent {
    switch(data.metaType) {
        case 0x01:
            let text: Types.MetaTextEvent = {
                type: "text",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                text: strFromArr(data.bytes)
            };
            return text;
        case 0x02:
            let copyright: Types.MetaTextEvent = {
                type: "copyright",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                text: strFromArr(data.bytes)
            };
            return copyright;
        case 0x03:
            let sequence: Types.MetaTextEvent = {
                type: "sequence",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                text: strFromArr(data.bytes)
            };
            return sequence;
        case 0x04:
            let instrumentName: Types.MetaTextEvent = {
                type: "instrumentName",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                text: strFromArr(data.bytes)
            };
            return instrumentName;
        case 0x05:
            let lyric: Types.MetaTextEvent = {
                type: "lyric",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                text: strFromArr(data.bytes)
            };
            return lyric;
        case 0x06:
            let marker: Types.MetaTextEvent = {
                type: "marker",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                text: strFromArr(data.bytes)
            }
            return marker;
        case 0x07:
            let cuePoint: Types.MetaTextEvent = {
                type: "cuePoint",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                text: strFromArr(data.bytes)
            }
            return cuePoint;
        case 0x20:
            if (data.size !== 1) { throw new Error("Invalid Channel Prefix Length, not equal to 1") }
            let midiChannelPrefix: Types.MetaChannelPrefixEvent = {
                type: "channelPrefix",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                channel: data.bytes[0]
            }
            return midiChannelPrefix;
        case 0x2f:
            if (data.size !== 0) { throw new Error("Invalid EOT Length, not equal to 0") }
            let eot: Types.Event = {
                type: "eot",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
            }
            return eot;
        case 0x51:
            if (data.size !== 3) { throw new Error("Invalid Set Tempo Length, not equal to 3") }
            let setTempo: Types.MetaTempoEvent = {
                type: "setTempo",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                msPerQuarterNote: parseU24(data.bytes)
            }
            return setTempo;
        case 0x54:
            if (data.size !== 5) { throw new Error("Invalid SMPTE Offset Length, not equal to 3") }
            let smpteOffset: Types.MetaSMPTEOffsetEvent = {
                type: "smpteOffset",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                hr: data.bytes[0],
                mn: data.bytes[1],
                se: data.bytes[2],
                fr: data.bytes[3],
                ff: data.bytes[4]
            }
            return smpteOffset;
        case 0x58: 
            if (data.size !== 4) { throw new Error("Invalid Time Signature Length, not equal to 4") }
            let timeSignature: Types.MetaTimeSignatureEvent = {
                type: "timeSignature",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                nn: data.bytes[0],
                dd: data.bytes[1],
                cc: data.bytes[2],
                bb: data.bytes[3]
            }
            return timeSignature;   
        case 0x59:
            if (data.size !== 2) { throw new Error("Invalid Key Signature Length, not equal to 2") }
            let keySignature: Types.MetaKeySignatureEvent = {
                type: "keySignature",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                sf: data.bytes[0],
                mi: data.bytes[1]
            }
            return keySignature;
        case 0x7f:
            let sequencerSpecific: Types.MetaSequencerSpecificEvent = {
                type: "sequencerSpecific",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                data: data.bytes
            }
            return sequencerSpecific;
        default:          
            let unknownEvent: Types.Event = {
                type: "unknownMetaEvent",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
            }
            return unknownEvent;
    }
}

function parseMidiEvent(data: Types.GenericMidiEvent): Types.TrackEvent {
    if(data.p1 === null) {throw new Error("parameter 1 in MIDI event is null")};
    
    switch(data.midiType) {
        case 0x08:
            if(data.p2 === null) { throw new Error("parameter 2 in MIDI note on event is null") };     
            let noteOffEvent: Types.MidiNoteEvent = {
                type: "noteOff",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                channel: data.channel,
                noteNumber: data.p1,
                velocity:   data.p2,
            } 
            return noteOffEvent;
        case 0x09:
            if(data.p2 === null) { throw new Error("parameter 2 in MIDI note off event is null") };
            //If parameter 2, i.e. velocity is zero, it is a noteOff-event which allows running status.
            let noteOnEvent: Types.MidiNoteEvent = {
                type: (data.p2 !== 0) ? "noteOn" : "noteOff",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                channel: data.channel,
                noteNumber: data.p1,
                velocity: data.p2
            }
            return noteOnEvent;
        case 0x0a:
            if(data.p2 === null) { throw new Error("parameter 2 in MIDI note Aftertouch event is null") };
            let noteAftertouchEvent: Types.MidiNoteAftertouchEvent = {
                type: "noteAftertouch",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                channel: data.channel,
                noteNumber: data.p1,
                amount: data.p2
            }
            return noteAftertouchEvent;
        case 0x0b:
            if(data.p2 === null) { throw new Error("parameter 2 in MIDI Controller Event is null") };
            let controllerEvent: Types.MidiControllerEvent = {
                type: "midiController",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                channel: data.channel,
                controller: data.p1,
                value: data.p2       
            }
            return controllerEvent;
        case 0x0c: 
            let programChange: Types.MidiProgramChangeEvent = {
                type: "programChange",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                channel: data.channel,
                programNumber: data.p1  
            }
            return programChange;
        case 0x0d: 
            let channelAftertouch: Types.MidiChannelAftertouchEvent = {
                type: "channelAftertouch",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                channel: data.channel,
                amount: data.p1,
            }
            return channelAftertouch;
        case 0x0e:
            if(data.p2 === null) { throw new Error("parameter 2 in MIDI Controller Event is null") }; 
            let pitchBend: Types.MidiChannelPitchBendEvent = {
                type: "pitchBend",
                deltaTime: data.deltaTime,
                absoluteTime: data.absoluteTime,
                channel: data.channel,
                value: pitchBendValue(data.p1, data.p2)
            }
            return pitchBend;
        default: throw new Error("Invalid MIDI event type when parsing MIDI event: " + data.midiType);
    }
}

function parseSysexEvent(data: Types.GenericSysexEvent): Types.TrackEvent {
    if(data.sysexType === 0xf0) {
        let sysexEvent: Types.SysexEvent = {
            type: "sysexMessage",
            deltaTime: data.deltaTime,
            absoluteTime: data.absoluteTime,
            data: data.bytes
        }
        return sysexEvent;
    }
    else if(data.sysexType === 0xf7) {
        let sysexEvent: Types.SysexEvent = {
            type: "escapeSequence",
            deltaTime: data.deltaTime,
            absoluteTime: data.absoluteTime,
            data: data.bytes
        }
        return sysexEvent;
    }
    throw new Error("Unsupported System Common Message: " + data.sysexType)
}

//returns 4 most sig. bits as midi type and 4 least sig. bits as channel
function midiChannelAndType(eventType: number): number[] {
    let midiType: number = eventType >> 4;
    let midiChannel: number = eventType & 0x0f;

    return [midiType, midiChannel];
}

//Check if Midi Event requires 1 or 2 bytes of data (parameters)
function twoParametersRequired(midiType: number): boolean {
    switch(midiType) {
        case 0x08: return true;
        case 0x09: return true;
        case 0x0a: return true;
        case 0x0b: return true;
        case 0x0c: return false;
        case 0x0d: return false;
        case 0x0e: return true;
        default: throw new Error("Invalid MIDI event type when checking parameter: " + midiType);
    }
}

//Converts u8-Array with length 3 to U24 big endian
function parseU24(u8s: number[]): number {
    let b0 = u8s[0],
        b1 = u8s[1],
        b2 = u8s[2]; 

    return (b0 << 16) | (b1 << 8) | b2;
}

//Converts 2 bytes: lsb, msb 0 - 16383 to a value ranging from -1 to 1. Pitch bend center is at 8192
function pitchBendValue(lsb: number, msb: number): number {
    const center: number = 8192;
    let val: number = (msb << 7) | lsb;

    return normalize(val, center);
}

// if not an actual midi event then running status is assumed.
let isRunningStatus = (eventType: number): boolean => (eventType & 0x80) === 0;

// returns -1 to 1 based on a center value (avg. of min and max) 
let normalize = (input: number, cent: number): number => (input - cent) / cent;

//Converts ArrayBuffer to an iterable Array of u8s
let u8ArrFromArrayBuffer = (u8ArrBuf: ArrayBuffer): number[] => Array.from(new Uint8Array(u8ArrBuf));

//Converts Array to String
function strFromArr(u8s: number[]): string {
    let stringOutput: string = "";

    for (let i = 0; i < u8s.length; i++) {
        stringOutput += String.fromCharCode(u8s[i]);
    }

    return stringOutput;
}
