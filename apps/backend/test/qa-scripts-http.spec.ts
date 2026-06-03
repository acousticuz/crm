import "reflect-metadata";
import { UserRole } from "@acoustic-crm/shared";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { QaController } from "../src/modules/qa/qa.controller";

/**
 * RBAC contract for the sales-script editor. The script feature builds on the
 * existing QA endpoints, so this asserts the @Roles() decorator on each
 * Script-CRUD handler stays correct: operators read, supervisors + admins
 * write. Reflector-based — no HTTP roundtrip needed; deterministic and fast.
 *
 * If a future change tightens or loosens these roles inadvertently, this
 * test fails first.
 */
describe("QA scripts RBAC contract (sales script feature)", () => {
  function rolesFor(handler: keyof QaController): UserRole[] {
    const proto = QaController.prototype as unknown as Record<string, unknown>;
    const method = proto[handler as string];
    if (typeof method !== "function") {
      throw new Error(`Handler ${handler} not found on QaController`);
    }
    const meta = Reflect.getMetadata(ROLES_KEY, method) as UserRole[] | undefined;
    return meta ?? [];
  }

  it("operators can READ the script list and a single script", () => {
    expect(rolesFor("listScripts")).toContain(UserRole.OPERATOR);
    expect(rolesFor("findScript")).toContain(UserRole.OPERATOR);
  });

  it("operators CANNOT create/update/delete scripts", () => {
    expect(rolesFor("createScript")).not.toContain(UserRole.OPERATOR);
    expect(rolesFor("updateScript")).not.toContain(UserRole.OPERATOR);
    expect(rolesFor("deleteScript")).not.toContain(UserRole.OPERATOR);
  });

  it("supervisors CAN create/update/delete scripts", () => {
    expect(rolesFor("createScript")).toContain(UserRole.SUPERVISOR);
    expect(rolesFor("updateScript")).toContain(UserRole.SUPERVISOR);
    expect(rolesFor("deleteScript")).toContain(UserRole.SUPERVISOR);
  });

  it("tenant-admins CAN create/update/delete scripts", () => {
    expect(rolesFor("createScript")).toContain(UserRole.TENANT_ADMIN);
    expect(rolesFor("updateScript")).toContain(UserRole.TENANT_ADMIN);
    expect(rolesFor("deleteScript")).toContain(UserRole.TENANT_ADMIN);
  });

  it("analysts cannot mutate scripts (read-only role)", () => {
    expect(rolesFor("createScript")).not.toContain(UserRole.ANALYST);
    expect(rolesFor("updateScript")).not.toContain(UserRole.ANALYST);
    expect(rolesFor("deleteScript")).not.toContain(UserRole.ANALYST);
  });
});
