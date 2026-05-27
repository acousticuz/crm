import { Injectable, Logger } from "@nestjs/common";
import type { Server } from "socket.io";

/**
 * Broadcasts domain events to per-tenant Socket.io rooms. The actual `Server`
 * instance is provided by the gateway after Nest finishes initializing it.
 * Other services depend on RealtimeService, not the gateway, so module wiring
 * stays clean.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  toTenant(tenantId: string, event: string, payload: unknown): void {
    if (!this.server) {
      // Pre-init or test mode — silently drop. Tests don't assert on emits.
      return;
    }
    this.server.to(this.tenantRoom(tenantId)).emit(event, payload);
    this.logger.debug?.(`Emitted ${event} to ${this.tenantRoom(tenantId)}`);
  }

  tenantRoom(tenantId: string): string {
    return `tenant:${tenantId}`;
  }
}
