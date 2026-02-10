import { test, expect } from '@playwright/test';

test.describe('Job Workflow E2E - Foundation', () => {
  test('should load the app and redirect to login', async ({ page }) => {
    await page.goto('/');

    // App requires authentication, redirects to login
    await page.waitForURL('**/login');

    // Verify the page loaded successfully
    await expect(page).toHaveTitle(/AI Batch Image Generator/i);
  });

  test('should display login interface', async ({ page }) => {
    await page.goto('/login');

    // Wait for the page to be ready
    await page.waitForLoadState('networkidle');

    // Verify login interface elements are visible
    const loginTitle = page.getByText('BulkImageGen');
    await expect(loginTitle).toBeVisible({ timeout: 10000 });

    // Should show password input
    const passwordInput = page.getByPlaceholder(/Password/i);
    await expect(passwordInput).toBeVisible();

    // Should show enter button
    const enterButton = page.getByRole('button', { name: /Enter/i });
    await expect(enterButton).toBeVisible();
  });

  test('should show error for invalid password', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Enter wrong password
    const passwordInput = page.getByPlaceholder(/Password/i);
    await passwordInput.fill('wrongpassword');

    // Click enter
    const enterButton = page.getByRole('button', { name: /Enter/i });
    await enterButton.click();

    // Should show error message
    const errorMessage = page.getByText(/Invalid password/i);
    await expect(errorMessage).toBeVisible({ timeout: 10000 });
  });
});
