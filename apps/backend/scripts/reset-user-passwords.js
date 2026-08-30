/**
 * Resets every non-deleted CRM user to one shared local password.
 *
 * Requires RESET_PASSWORD to be supplied explicitly.
 */
const { PrismaClient } = require("@prisma/client");
const argon2 = require("argon2");

async function main() {
  const prisma = new PrismaClient();
  try {
    const password = process.env.RESET_PASSWORD;
    if (!password) {
      throw new Error("RESET_PASSWORD must be set");
    }
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const result = await prisma.user.updateMany({
      where: { deletedAt: null },
      data: { passwordHash, status: "ACTIVE" },
    });

    console.log(`Reset ${result.count} user password(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("reset-user-passwords failed:", err);
    process.exit(1);
  });
}
