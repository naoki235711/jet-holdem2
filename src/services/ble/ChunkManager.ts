const HEADER_SIZE = 3; // [chunkIndex, totalChunks, reserved]

export class ChunkManager {
  private mtu: number;
  private static readonly TIMEOUT_MS = 5000;
  private receiveBuffers = new Map<
    string,
    { chunks: (Uint8Array | null)[]; total: number; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(mtu: number = 185) {
    this.mtu = mtu;
  }

  encode(json: string): Uint8Array[] {
    const payload = new TextEncoder().encode(json);
    const chunkPayloadSize = this.mtu - HEADER_SIZE;
    const totalChunks = Math.ceil(payload.length / chunkPayloadSize);
    const chunks: Uint8Array[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkPayloadSize;
      const end = Math.min(start + chunkPayloadSize, payload.length);
      const chunkPayload = payload.slice(start, end);

      const chunk = new Uint8Array(HEADER_SIZE + chunkPayload.length);
      chunk[0] = i;            // chunkIndex
      chunk[1] = totalChunks;  // totalChunks
      chunk[2] = 0;            // reserved
      chunk.set(chunkPayload, HEADER_SIZE);
      chunks.push(chunk);
    }

    return chunks;
  }

  decode(senderId: string, chunk: Uint8Array): string | null {
    const chunkIndex = chunk[0];
    const totalChunks = chunk[1];
    // reserved = chunk[2]
    const payload = chunk.slice(HEADER_SIZE);

    // Single-chunk fast path
    if (totalChunks === 1) {
      return new TextDecoder().decode(payload);
    }

    let buffer = this.receiveBuffers.get(senderId);
    if (!buffer || buffer.total !== totalChunks) {
      // New message or mismatched total — start fresh
      if (buffer) clearTimeout(buffer.timer);
      buffer = {
        chunks: new Array<Uint8Array | null>(totalChunks).fill(null),
        total: totalChunks,
        timer: setTimeout(() => {
          this.receiveBuffers.delete(senderId);
        }, ChunkManager.TIMEOUT_MS),
      };
      this.receiveBuffers.set(senderId, buffer);
    }

    buffer.chunks[chunkIndex] = payload;

    // Check if all chunks received
    const complete = buffer.chunks.every((c) => c !== null);
    if (!complete) return null;

    // Reassemble
    clearTimeout(buffer.timer);
    this.receiveBuffers.delete(senderId);
    const totalLength = buffer.chunks.reduce((sum, c) => sum + c!.length, 0);
    const assembled = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of buffer.chunks) {
      assembled.set(part!, offset);
      offset += part!.length;
    }
    return new TextDecoder().decode(assembled);
  }

  /** Clears all receive buffers. Call on cleanup. */
  clear(): void {
    for (const buf of this.receiveBuffers.values()) {
      clearTimeout(buf.timer);
    }
    this.receiveBuffers.clear();
  }
}
