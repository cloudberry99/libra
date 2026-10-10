import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

test('admin workflow, player payload, subscriptions and scannable QR on desktop and mobile', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '创建你的连接空间' })).toBeVisible();
  await page.screenshot({ path: 'test-results/login-desktop.png', fullPage: true });
  await page.getByPlaceholder('验证这个空间属于你').fill('local-browser-test-secret-not-for-production');
  await page.getByPlaceholder('至少 8 位，包含字母、数字和符号').fill('BrowserTest123!');
  await page.getByPlaceholder('再次输入管理密码').fill('BrowserTest123!');
  await page.getByRole('button', { name: '创建并进入工作台' }).click();
  await expect(page.getByRole('heading', { name: '第一份连接，从这里开始' })).toBeVisible();
  await page.getByRole('button', { name: '添加第一台服务器' }).click();
  await page.getByPlaceholder('例如：家庭媒体库').fill('家庭媒体库');
  await page.getByPlaceholder('一句话介绍这份媒体收藏').fill('家的每一帧，都值得收藏');
  await page.getByPlaceholder('Emby 账号').fill('demo');
  await page.getByPlaceholder('服务器登录密码').fill(' 中文 &+#% ');
  await page.getByPlaceholder('https://media.example.com:8920/emby').fill('https://media.example.com/emby');
  await page.getByRole('button', { name: /添加备用线路/ }).click();
  await page.getByPlaceholder('http://192.168.1.10:8096').fill('http://192.168.1.10:8096');
  await page.getByPlaceholder('例如：家中直连').fill('家中直连');
  await page.getByRole('dialog').getByRole('button', { name: '添加服务器', exact: true }).click();
  await expect(page.locator('.server-title').getByRole('heading', { name: '家庭媒体库' })).toBeVisible();
  await page.getByRole('button', { name: '导入播放器' }).click();
  const libraURL = await page.getByRole('link', { name: '打开 Libra' }).getAttribute('href');
  const payload = JSON.parse(
    Buffer.from(new URL(libraURL!).searchParams.get('data')!, 'base64url').toString('utf8'),
  );
  expect(payload.credentials.password).toBe(' 中文 &+#% ');
  expect(payload.alternates[0].name).toBe('家中直连');
  await page.getByRole('button', { name: /SenPlayer 账号与多线路/ }).click();
  expect(await page.getByRole('link', { name: '打开 SenPlayer' }).getAttribute('href')).toMatch(
    /^senplayer:\/\/importserver/,
  );
  await page.getByRole('button', { name: /ePlayerX 添加或更新服务器/ }).click();
  expect(await page.getByRole('link', { name: '打开 ePlayerX' }).getAttribute('href')).toMatch(
    /^eplayerx:\/\/add-or-update/,
  );
  await page.getByRole('button', { name: /Hills 账号与多线路/ }).click();
  await expect(page.getByRole('alert')).toContainText('基础路径');
  await page.getByRole('button', { name: /小幻播放器 RodelPlayer/ }).click();
  await expect(page.getByRole('alert')).toContainText('基础路径');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  // Fictional data only, used to inspect populated layouts.
  await page.evaluate(async () => {
    for (const [name, note, host] of [
      ['星河放映室', '把夜晚交给一部好电影', 'cinema.example.com'],
      ['周末纪录片', '总有一个世界，尚未抵达', 'documentary.example.com'],
      ['音乐现场', '留住那些不想散场的夜晚', 'concert.example.com'],
      ['动画收藏馆', '给想象力留一个位置', 'anime.example.com'],
      ['私人影院', '光影之间，自有天地', 'private.example.com'],
    ]) {
      const response = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Libra-Request': '1' },
        body: JSON.stringify({
          config: {
            type: 'emby',
            name,
            note,
            credentials: { username: 'demo' },
            primary: { url: `https://${host}` },
          },
        }),
      });
      if (!response.ok) throw new Error('Fixture creation failed');
    }
  });
  await page.getByRole('button', { name: '刷新服务器' }).click();
  await expect(page.locator('.server-card')).toHaveCount(6);
  await expect(page.locator('.toast')).toBeHidden();
  await page.screenshot({ path: 'test-results/workspace-desktop.png', fullPage: true });
  await page.getByPlaceholder('搜索名称、地址或账号').fill('家庭');
  await expect(page.locator('.server-card')).toHaveCount(1);
  await page.getByRole('button', { name: '清除搜索' }).click();
  await page.getByRole('button', { name: '列表视图' }).click();
  await expect(page.locator('.server-grid')).toHaveClass(/list-layout/);
  await page.getByRole('button', { name: '卡片视图' }).click();
  await page
    .locator('nav')
    .getByRole('button', { name: /订阅链接/ })
    .click();
  await page.getByRole('button', { name: '创建第一条订阅' }).click();
  await page.getByRole('dialog').getByLabel('订阅名称').fill('我的 iPhone');
  await page
    .getByRole('dialog')
    .getByLabel(/链接后缀/)
    .fill('BrowserFeed123');
  await page.getByRole('button', { name: '创建链接', exact: true }).click();
  await expect(page.locator('.subscription-card')).toHaveCount(1);
  await page.getByRole('button', { name: '二维码', exact: true }).click();
  const qr = page.getByRole('img', { name: '我的 iPhone 的订阅链接二维码' });
  await expect(qr).toBeVisible();
  const source = (await qr.getAttribute('src'))!;
  const png = PNG.sync.read(Buffer.from(source.split(',')[1], 'base64'));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(decoded?.data).toBe('http://127.0.0.1:8789/BrowserFeed123');
  await page.getByRole('button', { name: '复制链接', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('已复制到剪贴板');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(decoded!.data);
  await expect(page.locator('.toast')).toBeHidden();
  const feed = await page.request.get(decoded!.data);
  expect(feed.status()).toBe(200);
  expect((await feed.json()).length).toBe(6);
  await page.screenshot({ path: 'test-results/subscription-qr.png', fullPage: true });
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载二维码' }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('libra-subscription-BrowserFeed123.png');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/subscriptions-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '打开导航' }).click();
  await page
    .locator('nav')
    .getByRole('button', { name: /服务器/ })
    .click();
  await expect(page.locator('.server-card')).toHaveCount(6);
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.screenshot({
    path: 'test-results/workspace-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '编辑 家庭媒体库', exact: true }).click();
  await expect(page.getByPlaceholder('服务器登录密码')).toHaveValue(' 中文 &+#% ');
  await page.screenshot({
    path: 'test-results/server-editor-mobile.png',
    fullPage: false,
    animations: 'disabled',
  });
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  await page.screenshot({ path: 'test-results/login-mobile.png', fullPage: true });
  expect(pageErrors).toEqual([]);
});
