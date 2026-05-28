import { IsObject, IsOptional, IsString } from "class-validator";

export class UpsertIntegrationDto {
  @IsOptional()
  @IsString()
  provider?: string;

  // Flat key/value config. Secret keys (per integration-fields.ts) are
  // encrypted before storage. A masked value (starting with •) means
  // "keep the existing secret" — the frontend never sends real secrets back
  // unless the operator re-types them.
  @IsObject()
  config!: Record<string, unknown>;
}
