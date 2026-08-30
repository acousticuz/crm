import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Public } from "../../common/decorators/public.decorator";
import { AcousticSyncService } from "./acoustic-sync.service";

interface RunSyncBody {
  dateFrom?: string;
  dateTo?: string;
}

@Public()
@Controller("internal/acoustic-sync")
export class AcousticSyncController {
  constructor(
    private readonly sync: AcousticSyncService,
    private readonly config: ConfigService,
  ) {}

  @Post("run")
  @HttpCode(HttpStatus.OK)
  run(
    @Headers("x-internal-key") internalKey: string | undefined,
    @Headers("authorization") authorization: string | undefined,
    @Body() body: RunSyncBody,
  ): Promise<unknown> {
    this.assertInternalKey(internalKey, authorization);
    if (body.dateFrom || body.dateTo) {
      if (!body.dateFrom || !body.dateTo) {
        throw new BadRequestException("dateFrom and dateTo must be provided together");
      }
      return this.sync.syncRange({ dateFrom: body.dateFrom, dateTo: body.dateTo });
    }
    return this.sync.syncYesterday();
  }

  private assertInternalKey(
    internalKey: string | undefined,
    authorization: string | undefined,
  ): void {
    const expected = this.config.get<string>("ACOUSTIC_INTERNAL_API_KEY", "");
    const bearer = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";
    if (!expected || (internalKey !== expected && bearer !== expected)) {
      throw new UnauthorizedException("Invalid internal credentials");
    }
  }
}
