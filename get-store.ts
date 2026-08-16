import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const stores = await p.store.findMany({select:{id:true,name:true},orderBy:{updatedAt:'desc'},take:3});
console.log(JSON.stringify(stores));
await p.
$disconnect();
