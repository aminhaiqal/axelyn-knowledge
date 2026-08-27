import { expect, test } from "@playwright/test";

test("an operator creates, inspects, and approves atomic knowledge", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const title = `E2E reviewer observation ${suffix}`;
  const statement = `A reviewer can trace the E2E decision path ${suffix}.`;

  await page.goto("/knowledge?workspace=e2e");
  await page.getByText("Add one exact atomic statement instead").click();
  await page.getByLabel("Short title").fill(title);
  await page.getByLabel("Atomic canonical statement").fill(statement);
  await page.getByRole("button", { name: "Create proposal" }).click();
  await expect(page.getByRole("link", { name: statement })).toBeVisible();

  await page.getByRole("link", { name: statement }).click();
  await expect(page.locator("blockquote")).toContainText(statement);
  await expect(page.getByText("UNVERIFIED", { exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: "Inbox" }).click();
  const proposal = page.locator("article").filter({ hasText: title });
  await expect(proposal).toBeVisible();
  await proposal.getByRole("button", { name: "Approve knowledge" }).click();
  await expect(proposal).toHaveCount(0);

  await page.getByRole("link", { name: "Library" }).click();
  await page.getByLabel("Search statements").fill(suffix);
  await page.getByRole("button", { name: "Apply filters" }).click();
  const row = page.locator("tr").filter({ hasText: statement });
  await expect(row).toContainText("ACTIVE");
  await expect(row).toContainText("UNVERIFIED");
});

test("an operator imports pasted source material through the guided intake", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const title = `E2E interview notes ${suffix}`;

  await page.goto("/add?workspace=e2e");
  await expect(
    page.getByRole("heading", { name: "Add knowledge from what you already have" }),
  ).toBeVisible();
  await page.getByLabel("Source name Optional").fill(title);
  await page
    .getByLabel("Paste your material")
    .fill(`The review team needs a visible evidence path for every decision. ${suffix}`);
  await page.getByRole("button", { name: "Import text" }).click();

  const receipt = page.locator(".intake-result");
  await expect(receipt).toContainText(title);
  await expect(receipt).toContainText("Source saved");
  await receipt.getByRole("link", { name: "View extraction" }).click();
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
});
