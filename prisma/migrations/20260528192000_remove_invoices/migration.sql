/*
  Warnings:

  - You are about to drop the column `email` on the `Member` table. All the data in the column will be lost.
  - You are about to drop the column `invoiceId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the `Invoice` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `subscriptionId` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_memberId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_subscriptionId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_invoiceId_fkey";

-- AlterTable
ALTER TABLE "Member" DROP COLUMN "email";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "invoiceId",
ADD COLUMN     "subscriptionId" TEXT NOT NULL;

-- DropTable
DROP TABLE "Invoice";

-- CreateIndex
CREATE INDEX "Payment_subscriptionId_idx" ON "Payment"("subscriptionId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
