import { Chunk } from "./types";

export class BytesParser {
    arrayBuffer: ArrayBuffer;
    dataview: DataView;
    arrayBufferLength: number;
    pos: number;
    checkSum: number;

    constructor(arrayBuffer: ArrayBuffer) {
        this.arrayBuffer = arrayBuffer;
        this.dataview = new DataView(this.arrayBuffer, 0);
        this.arrayBufferLength = arrayBuffer.byteLength;
        this.pos = 0;
        this.checkSum = 0;
    }

    lastByte (byte: number): boolean { return ((byte & 0x80) === 0) };

    eof(): boolean { return this.pos >= this.arrayBufferLength };
    
    decPos(amount: number) {
        this.pos -= amount;
        this.checkSum -= amount;
    }

    incPos(amount: number) {
        this.pos += amount;
        this.checkSum += amount;
    }

    parseU8(): number {
        let u8: number = this.dataview.getUint8(this.pos);
        this.incPos(1);
        return u8;
    }

    parseI8(): number {
        let i8: number = this.dataview.getInt8(this.pos);
        this.incPos(1);
        return i8;
    }

    parseU16(): number {
        let u16: number = this.dataview.getUint16(this.pos);
        this.incPos(2);
        return u16;
    }

    parseI16(): number {
        let i16: number = this.dataview.getInt16(this.pos);
        this.incPos(2);
        return i16;
    }

    parseU32(): number {
        let u32: number = this.dataview.getUint32(this.pos);
        this.incPos(4);
        return u32;
    }

    parseI32(): number {
        let i32: number = this.dataview.getInt32(this.pos);
        this.incPos(4);
        return i32; 
    }

    parseBytesAsArrayBuffer(length: number): ArrayBuffer {
        let arrayBuffer: ArrayBuffer = this.arrayBuffer.slice(this.pos, this.pos + length);
        this.incPos(length);
        return arrayBuffer;
    }

    parseBytes(length: number): number[] {
        let u8s: number[] = Array.from(new Uint8Array(this.arrayBuffer.slice(this.pos, this.pos + length)));
        this.incPos(length);
        return u8s;
    }

    parseStr(length: number): string {
        let buf: ArrayBuffer = this.arrayBuffer.slice(this.pos, this.pos + length);
        let output = String.fromCharCode.apply(null, Array.from(new Uint8Array(buf)));
        this.incPos(length);
        return output;
    }

    parseVLQ(): number {
        let output: number = 0;

        while(!this.eof()) {
            let byte = this.parseU8();
            output = (output << 7) | (byte & 0x7f) as number;

            if (this.lastByte(byte)) break;
        }
        return output;
    }

    parseChunk(): Chunk {
        let id: string = this.parseStr(4);
        let size: number = this.parseU32();
        let data: ArrayBuffer = this.parseBytesAsArrayBuffer(size);
        return { id, size, data };
    }

}

export default BytesParser;