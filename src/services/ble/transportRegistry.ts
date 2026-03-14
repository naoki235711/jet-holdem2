import { BleHostTransport, BleClientTransport } from './BleTransport';

let hostTransport: BleHostTransport | null = null;
let clientTransport: BleClientTransport | null = null;

export function setHostTransport(t: BleHostTransport): void { hostTransport = t; }
export function getHostTransport(): BleHostTransport | null { return hostTransport; }
export function clearHostTransport(): void { hostTransport = null; }

export function setClientTransport(t: BleClientTransport): void { clientTransport = t; }
export function getClientTransport(): BleClientTransport | null { return clientTransport; }
export function clearClientTransport(): void { clientTransport = null; }
