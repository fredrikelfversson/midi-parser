export interface Event {
    type: string,
    deltaTime: number,
    absoluteTime
}

export interface MidiNoteEvent extends Event {
    channel: number,
    noteNumber: number,
    velocity:   number
}

interface MidiNoteAftertouchEvent extends Event {
    channel: number,
    noteNumber: number,
    amount: number
}

interface MidiControllerEvent extends Event {
    channel: number,
    controller: number,
    value: number
}

interface MidiProgramChangeEvent extends Event {
    channel: number,
    programNumber: number,
}

interface MidiChannelAftertouchEvent extends Event {
    channel: number,
    amount: number,
}

interface MidiChannelPitchBendEvent extends Event {
    channel: number,
    value: number
}

interface MetaTextEvent extends Event {
    text: string
}

interface MetaChannelPrefixEvent extends Event {
    channel: number
}

interface MetaTempoEvent extends Event {
    msPerQuarterNote: number
}

interface MetaSMPTEOffsetEvent extends Event {
    hr: number,
    mn: number,
    se: number,
    fr: number,
    ff: number
}

interface MetaTimeSignatureEvent extends Event {
    nn: number,
    dd: number,
    cc: number,
    bb: number
}

interface MetaKeySignatureEvent extends Event {
    sf: number,
    mi: number,
}

interface MetaSequencerSpecificEvent extends Event {
    data: number[]
}

interface SysexEvent extends Event {
    data: number[]
}

interface GenericSysexEvent {
    deltaTime: number,
    absoluteTime: number,
    sysexType: number,
    bytes: number[]
}

interface GenericMidiEvent {
    deltaTime: number,
    absoluteTime: number, 
    midiType: number, 
    channel: number, 
    p1: Nullable<number>, 
    p2: Nullable<number>
}

interface GenericMetaEvent {
    deltaTime: number, 
    absoluteTime: number,
    metaType: number, 
    size: number, 
    bytes: number[]
}

type MetaEvent = MetaSequencerSpecificEvent | 
                 MetaKeySignatureEvent | 
                 MetaSMPTEOffsetEvent | 
                 MetaTempoEvent |
                 MetaChannelPrefixEvent |
                 MetaTextEvent |
                 MetaTimeSignatureEvent |
                 Event;
                 

type MidiEvent = MidiNoteEvent | 
                  MidiNoteAftertouchEvent | 
                  MidiControllerEvent |
                  MidiProgramChangeEvent |
                  MidiChannelAftertouchEvent |
                  MidiChannelPitchBendEvent;

type TrackEvent = MetaEvent | MidiEvent | SysexEvent;

interface Chunk {
    id: string,
    size: number,
    data: ArrayBuffer
}

interface Track {
    id: string,
    size: number,
    ticksDuration: number,
    tempo: number,
    events: TrackEvent[];
}

interface MidiHeader {
    id: string,
    size: number,
    formatType: number,
    trackAmount: number,
    timeDivision: number
}

interface MidiFileData {
    header: MidiHeader,
    tracks: Track[]
}

type Nullable<T> = T | null;