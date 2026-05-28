import { Type } from "class-transformer";
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class AnalyticsRangeDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class TrendQueryDto extends AnalyticsRangeDto {
  @IsOptional()
  @IsIn(["calls", "qa", "sentiment"])
  metric?: "calls" | "qa" | "sentiment";

  @IsOptional()
  @IsIn(["day", "week"])
  groupBy?: "day" | "week";
}

export class WeakestCriteriaQueryDto extends AnalyticsRangeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
