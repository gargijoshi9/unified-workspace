import { PrismaClient, Role, TicketStatus, PRStatus, ConnectionStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    const passwordHash = await bcrypt.hash("password123", 10);

    // Clear existing data to make seed idempotent
    console.log("Cleaning database...");
    await prisma.auditLog.deleteMany();
    await prisma.featureFlag.deleteMany();
    await prisma.ticketComment.deleteMany();
    await prisma.ticketShare.deleteMany();
    await prisma.ticket.deleteMany();
    await prisma.pRReviewer.deleteMany();
    await prisma.pRVersion.deleteMany();
    await prisma.pRShare.deleteMany();
    await prisma.pR.deleteMany();
    await prisma.orgConnection.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.org.deleteMany();
    console.log("Database cleaned.");

    // --- Orgs ---
    const acme = await prisma.org.create({ data: { name: "Acme Corp" } });
    const globex = await prisma.org.create({ data: { name: "Globex Inc" } });

    // --- Users ---
    const admin = await prisma.user.create({
        data: { email: "admin@acme.com", passwordHash, name: "Alice Admin" },
    });
    const agent = await prisma.user.create({
        data: { email: "agent@acme.com", passwordHash, name: "Sam Support" },
    });
    const reviewer = await prisma.user.create({
        data: { email: "reviewer@acme.com", passwordHash, name: "Ravi Reviewer" },
    });
    const globexAdmin = await prisma.user.create({
        data: { email: "admin@globex.com", passwordHash, name: "Gina Guest" },
    });
    const superAdmin = await prisma.user.create({
        data: { email: "super@platform.com", passwordHash, name: "Pat SuperAdmin" },
    });

    // --- Memberships (who belongs to which org with what role) ---
    await prisma.membership.createMany({
        data: [
            { userId: admin.id, orgId: acme.id, role: Role.ORG_ADMIN },
            { userId: agent.id, orgId: acme.id, role: Role.SUPPORT_AGENT },
            { userId: reviewer.id, orgId: acme.id, role: Role.REVIEWER_APPROVER },
            { userId: globexAdmin.id, orgId: globex.id, role: Role.ORG_ADMIN },
            { userId: superAdmin.id, orgId: acme.id, role: Role.PLATFORM_SUPER_ADMIN },
        ],
    });

    // --- Org connection (Acme <-> Globex, approved) ---
    const connection = await prisma.orgConnection.create({
        data: {
            orgAId: acme.id,
            orgBId: globex.id,
            status: ConnectionStatus.APPROVED,
        },
    });

    // --- Sample tickets ---
    const ticket1 = await prisma.ticket.create({
        data: {
            orgId: acme.id,
            title: "Login page throws 500 error",
            description: "Users report a server error when logging in via SSO.",
            status: TicketStatus.OPEN,
            createdById: agent.id,
        },
    });

    const ticket2 = await prisma.ticket.create({
        data: {
            orgId: acme.id,
            title: "Add dark mode support",
            description: "Customer requested dark mode for the dashboard.",
            status: TicketStatus.IN_PROGRESS,
            createdById: admin.id,
        },
    });

    // Share ticket1 with Globex (cross-org sharing demo)
    await prisma.ticketShare.create({
        data: {
            ticketId: ticket1.id,
            sharedWithOrgId: globex.id,
        },
    });

    // --- Sample PRs ---
    const pr1 = await prisma.pR.create({
        data: {
            orgId: acme.id,
            title: "Refactor auth middleware",
            description: "Cleans up token validation logic.",
            status: PRStatus.IN_REVIEW,
            authorId: admin.id,
            requiredApprovals: 1,
        },
    });

    await prisma.pRReviewer.create({
        data: {
            prId: pr1.id,
            userId: reviewer.id,
        },
    });

    // --- Feature flag example ---
    await prisma.featureFlag.create({
        data: {
            orgId: acme.id,
            key: "dark_mode_enabled",
            enabled: false,
        },
    });

    console.log("✅ Seed data created successfully");
    console.log({
        orgs: { acme: acme.id, globex: globex.id },
        connection: connection.id,
        tickets: [ticket1.id, ticket2.id],
        pr: pr1.id,
    });
    console.log("\nLogin credentials (all use password: password123):");
    console.log("- admin@acme.com (Org Admin, Acme)");
    console.log("- agent@acme.com (Support Agent, Acme)");
    console.log("- reviewer@acme.com (Reviewer/Approver, Acme)");
    console.log("- admin@globex.com (Org Admin, Globex)");
    console.log("- super@platform.com (Platform Super Admin)");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });