import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { UserRole, type JwtPayload } from "@acoustic-crm/shared";
import { RealtimeService } from "./realtime.service";

interface SocketJwt {
  sub: string;
  tenantId: string;
  role: UserRole;
  email: string;
}

/**
 * Auth handshake:
 *   - Token comes from socket.handshake.auth.token, or `Authorization: Bearer`
 *     header during the polling upgrade path.
 *   - Verified against JWT_ACCESS_SECRET.
 *   - Socket joins tenant:{tenantId} room so cards/sms/calls events are
 *     broadcast only to the right tenant.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class AppGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(AppGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(): void {
    this.realtime.setServer(this.server);
    this.logger.log("Socket.io gateway ready");
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`Rejected socket ${client.id}: missing token`);
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<SocketJwt>(token, {
        secret: this.config.get<string>("JWT_ACCESS_SECRET", "change-me-access-secret"),
      });
      const user: JwtPayload = {
        sub: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
        email: payload.email,
      };
      client.data.user = user;
      await client.join(this.realtime.tenantRoom(user.tenantId));
      this.logger.log(`Socket ${client.id} joined ${this.realtime.tenantRoom(user.tenantId)}`);
    } catch (err) {
      this.logger.warn(`Rejected socket ${client.id}: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug?.(`Socket ${client.id} disconnected`);
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) return auth.token;
    const header = client.handshake.headers.authorization;
    if (typeof header === "string" && header.startsWith("Bearer ")) {
      return header.slice("Bearer ".length);
    }
    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === "string") return queryToken;
    return null;
  }
}
