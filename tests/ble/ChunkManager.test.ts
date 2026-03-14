import { ChunkManager } from '../../src/services/ble/ChunkManager';

describe('ChunkManager', () => {
  describe('encode', () => {
    it('encodes a short message into a single chunk', () => {
      const cm = new ChunkManager(185);
      const chunks = cm.encode('{"type":"ready"}');
      expect(chunks).toHaveLength(1);
      // Header: [0, 1, 0] then UTF-8 payload
      expect(chunks[0][0]).toBe(0);   // chunkIndex
      expect(chunks[0][1]).toBe(1);   // totalChunks
      expect(chunks[0][2]).toBe(0);   // reserved
      const payload = new TextDecoder().decode(chunks[0].slice(3));
      expect(payload).toBe('{"type":"ready"}');
    });

    it('splits a long message into multiple chunks', () => {
      const cm = new ChunkManager(10); // tiny MTU: 7 bytes payload per chunk
      const json = 'ABCDEFGHIJKLMNOPQRST'; // 20 bytes → ceil(20/7) = 3 chunks
      const chunks = cm.encode(json);
      expect(chunks).toHaveLength(3);
      expect(chunks[0][0]).toBe(0); // chunkIndex 0
      expect(chunks[0][1]).toBe(3); // totalChunks 3
      expect(chunks[1][0]).toBe(1);
      expect(chunks[2][0]).toBe(2);
    });

    it('produces chunks no larger than MTU', () => {
      const mtu = 20;
      const cm = new ChunkManager(mtu);
      const json = 'A'.repeat(100);
      const chunks = cm.encode(json);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(mtu);
      }
    });
  });

  describe('decode', () => {
    it('decodes a single-chunk message immediately', () => {
      const cm = new ChunkManager(185);
      const chunks = cm.encode('{"type":"ready"}');
      const result = cm.decode('sender-1', chunks[0]);
      expect(result).toBe('{"type":"ready"}');
    });

    it('returns null for incomplete multi-chunk message', () => {
      const cm = new ChunkManager(10);
      const chunks = cm.encode('ABCDEFGHIJKLMNOPQRST');
      expect(chunks.length).toBeGreaterThan(1);
      const result = cm.decode('sender-1', chunks[0]);
      expect(result).toBeNull();
    });

    it('reassembles a multi-chunk message when all chunks arrive', () => {
      const cm = new ChunkManager(10);
      const original = 'ABCDEFGHIJKLMNOPQRST';
      const chunks = cm.encode(original);
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(cm.decode('sender-1', chunks[i])).toBeNull();
      }
      const result = cm.decode('sender-1', chunks[chunks.length - 1]);
      expect(result).toBe(original);
    });

    it('reassembles chunks arriving out of order', () => {
      const cm = new ChunkManager(10);
      const original = 'ABCDEFGHIJKLMNOPQRST';
      const chunks = cm.encode(original);
      // Send last chunk first, then the rest
      expect(cm.decode('sender-1', chunks[chunks.length - 1])).toBeNull();
      for (let i = 0; i < chunks.length - 2; i++) {
        expect(cm.decode('sender-1', chunks[i])).toBeNull();
      }
      const result = cm.decode('sender-1', chunks[chunks.length - 2]);
      expect(result).toBe(original);
    });

    it('handles multiple senders independently', () => {
      const cm = new ChunkManager(10);
      const msg1 = 'ABCDEFGHIJKLMNOPQRST';
      const msg2 = 'UVWXYZ1234567890ABCD';
      const chunks1 = cm.encode(msg1);
      const chunks2 = cm.encode(msg2);

      // Interleave chunks from two senders
      cm.decode('sender-1', chunks1[0]);
      cm.decode('sender-2', chunks2[0]);
      cm.decode('sender-1', chunks1[1]);
      cm.decode('sender-2', chunks2[1]);

      const result1 = cm.decode('sender-1', chunks1[2]);
      expect(result1).toBe(msg1);

      const result2 = cm.decode('sender-2', chunks2[2]);
      expect(result2).toBe(msg2);
    });
  });

  describe('decode timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('discards partial buffer after 5 seconds and allows fresh reassembly', () => {
      const cm = new ChunkManager(10);
      const original = 'ABCDEFGHIJKLMNOPQRST';
      const chunks = cm.encode(original);

      // Send only the first chunk
      cm.decode('sender-1', chunks[0]);

      // Advance time past the 5s timeout
      jest.advanceTimersByTime(5000);

      // Re-send ALL chunks — should reassemble from scratch (old buffer was discarded)
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(cm.decode('sender-1', chunks[i])).toBeNull();
      }
      const result = cm.decode('sender-1', chunks[chunks.length - 1]);
      expect(result).toBe(original);
    });
  });
});
