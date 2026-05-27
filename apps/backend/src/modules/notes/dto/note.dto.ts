import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text!: string;

  @IsOptional()
  @IsString()
  cardId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;
}

export class UpdateNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text!: string;
}
