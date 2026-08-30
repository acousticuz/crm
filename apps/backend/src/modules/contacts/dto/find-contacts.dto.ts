import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export class FindContactsDto {
  // Free-text query — matches fullName (ILIKE) or any phone substring.
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  responsibleUserId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class FindAcousticClientsDto extends FindContactsDto {
  @IsOptional()
  @IsIn(["new_lead", "visited_no_purchase", "purchased", "needs_follow_up"])
  status?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}


export class FindAcousticPurchasesDto extends FindContactsDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;

  // Comma-separated analytics branch ids. Empty/undefined means all branches.
  @IsOptional()
  @IsString()
  branchIds?: string;
}
