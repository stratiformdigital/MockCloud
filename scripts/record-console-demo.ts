import { chromium } from "playwright";

const BASE = process.env.MOCKCLOUD_URL || "http://localhost:4444";
const PAUSE = 1500;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const headless = !process.argv.includes("--visible");
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: "demo-video", size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  // Home dashboard — wait for cards to fully load
  await page.goto(BASE);
  await page.waitForSelector("text=MockCloud");
  await sleep(5000);
  await sleep(PAUSE * 2);

  // Navigate to S3 via sidebar
  await page.locator("nav").getByText("S3").click();
  await page.waitForSelector("text=S3 Buckets");
  await sleep(PAUSE);

  // Create a bucket
  await page.getByRole("button", { name: "Create bucket" }).click();
  await page.getByPlaceholder("my-bucket").waitFor();
  await sleep(500);
  await page.getByPlaceholder("my-bucket").fill("demo-uploads");
  await sleep(800);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForSelector("text=demo-uploads");
  await sleep(PAUSE);

  // Click into the bucket
  await page.getByText("demo-uploads").first().click();
  await page.waitForSelector("text=Objects");
  await sleep(PAUSE);

  // Navigate to DynamoDB via sidebar
  await page.locator("nav").getByText("DynamoDB").click();
  await page.waitForSelector("text=Tables");
  await sleep(PAUSE);

  // Create a table
  await page.getByRole("button", { name: "Create table" }).click();
  await page.getByPlaceholder("my-table").waitFor();
  await sleep(500);
  await page.getByPlaceholder("my-table").fill("users");
  await sleep(800);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForSelector("text=users");
  await sleep(PAUSE);

  // Click into the table
  await page.getByText("users").first().click();
  await page.waitForSelector("text=Items");
  await sleep(PAUSE);

  // Navigate to Secrets Manager
  await page.locator("nav").getByText("Secrets Manager").click();
  await page.waitForSelector("text=Secrets Manager");
  await sleep(PAUSE);

  // Create a secret
  await page.getByRole("button", { name: "Create secret" }).click();
  await page.getByPlaceholder("my-secret").waitFor();
  await sleep(500);
  await page.getByPlaceholder("my-secret").fill("api-key");
  await sleep(500);
  await page.locator("textarea").first().fill("sk-demo-secret-12345");
  await sleep(800);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForSelector("text=api-key");
  await sleep(PAUSE);

  // Browse Lambda
  await page.locator("nav").getByText("Lambda").click();
  await page.waitForSelector("text=Functions");
  await sleep(PAUSE);

  // Browse CloudFormation
  await page.locator("nav").getByText("CloudFormation").click();
  await page.waitForSelector("text=Stacks");
  await sleep(PAUSE);

  // Browse IAM
  await page.locator("nav").getByText("IAM Roles").click();
  await page.waitForSelector("text=IAM Roles");
  await sleep(PAUSE);

  // Back to home to show dashboard with counts
  await page.locator("nav a.chalk-nav-header").click();
  await page.waitForSelector("text=MockCloud");
  await sleep(5000);
  await sleep(PAUSE * 2);

  await context.close();
  await browser.close();

  console.log("Recording saved to demo-video/");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
