// Usage: npm run set-plan -- someone@example.com pro
import { setPlanByEmail } from "./db.js";
import { PLANS } from "./limits.js";

const [email, plan] = process.argv.slice(2);
if (!email || !plan || !PLANS[plan]) {
  console.error(`Usage: npm run set-plan -- <email> <${Object.keys(PLANS).join("|")}>`);
  process.exit(1);
}
const n = setPlanByEmail(email, plan);
console.log(n ? `Set ${n} account(s) for ${email} to '${plan}'.` : `No account found for ${email}.`);
