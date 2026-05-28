import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { WorkerGuard } from "../calls/worker.guard";
import { TranscriptsService } from "./transcripts.service";
import { WriteTranscriptDto } from "./dto/transcript.dto";

@Controller("internal/transcripts")
export class TranscriptsController {
  constructor(private readonly service: TranscriptsService) {}

  @Public()
  @UseGuards(WorkerGuard)
  @Post()
  @HttpCode(HttpStatus.OK)
  write(@Body() dto: WriteTranscriptDto) {
    return this.service.write(dto);
  }
}
