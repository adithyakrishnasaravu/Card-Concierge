import fs from "fs/promises";
import path from "path";

const DATA_PATH = path.resolve(process.cwd(), "data/customers.json");

async function readData() {
  const raw = await fs.readFile(DATA_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeData(data) {
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2));
}

export async function getCustomerById(customerId) {
  const data = await readData();
  return data.customers.find((c) => c.id === customerId) || null;
}

export async function saveCustomer(updatedCustomer) {
  const data = await readData();
  const idx = data.customers.findIndex((c) => c.id === updatedCustomer.id);
  if (idx === -1) throw new Error(`Customer not found: ${updatedCustomer.id}`);
  data.customers[idx] = updatedCustomer;
  await writeData(data);
}

export async function listCards(customerId) {
  const customer = await getCustomerById(customerId);
  if (!customer) return [];
  return customer.cards || [];
}
