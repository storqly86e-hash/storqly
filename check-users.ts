import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const users = await p.user.findMany({ select: { id: true, email: true, name: true } });
  console.log(JSON.stringify(users, null, 2));
  await p.$disconnect();
}
main();
