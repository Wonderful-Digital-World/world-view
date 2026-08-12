import { expect, test } from "@playwright/test";

test("renders all five rooms without external requests", async ({
	page,
}): Promise<void> => {
	const externalRequests: Array<string> = [];

	page.on("request", (request): void => {
		const url = new URL(request.url());

		if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
			externalRequests.push(request.url());
		}
	});

	await page.goto("/rooms");
	await expect(page).toHaveTitle("World View");
	await expect(page.getByRole("heading", { name: "World View" })).toBeVisible();
	await expect(page.locator("canvas")).toBeVisible();

	const roomButtons = page.getByRole("button");

	await expect(roomButtons).toHaveCount(5);

	for (let index = 0; index < 5; index += 1) {
		const roomButton = roomButtons.nth(index);

		await roomButton.click();
		await expect(roomButton).toHaveAttribute("aria-pressed", "true");
	}

	expect(externalRequests).toEqual([]);
});
