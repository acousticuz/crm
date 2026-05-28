import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { UserRole, type JwtPayload } from "@acoustic-crm/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { AnalyticsService } from "./analytics.service";
import {
  AnalyticsRangeDto,
  TrendQueryDto,
  WeakestCriteriaQueryDto,
} from "./dto/analytics.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  // Operators can only see their own KPI; supervisors+ see anyone.
  @Roles(UserRole.OPERATOR, UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.ANALYST)
  @Get("operator-kpi")
  operatorKpi(@Query() query: AnalyticsRangeDto, @CurrentUser() user: JwtPayload) {
    const scoped: AnalyticsRangeDto = {
      ...query,
      userId:
        user.role === UserRole.OPERATOR ? user.sub : query.userId ?? user.sub,
    };
    return this.analytics.operatorKpi(scoped);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.ANALYST)
  @Get("team")
  team(@Query() query: AnalyticsRangeDto) {
    return this.analytics.teamSummary(query);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.ANALYST)
  @Get("branches")
  branches(@Query() query: AnalyticsRangeDto) {
    return this.analytics.branchSummary(query);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.ANALYST)
  @Get("weakest-criteria")
  weakest(@Query() query: WeakestCriteriaQueryDto) {
    return this.analytics.weakestCriteria(query);
  }

  @Roles(UserRole.OPERATOR, UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.ANALYST)
  @Get("trends")
  trends(@Query() query: TrendQueryDto, @CurrentUser() user: JwtPayload) {
    const scoped: TrendQueryDto = {
      ...query,
      userId:
        user.role === UserRole.OPERATOR ? user.sub : query.userId,
    };
    return this.analytics.trends(scoped);
  }
}
