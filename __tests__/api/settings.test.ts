import { writeFile, readFile } from 'fs/promises';
import type { NextApiRequest, NextApiResponse } from 'next';
import getConfig from 'next/config';
import handler from '../../pages/api/settings';
import * as settingsApi from '../../pages/api/settings';
import { getBranding } from '../../utils/branding';

const { platformName } = getBranding();
import verifyUser from '../../utils/verifyUser';

jest.mock('../../utils/verifyUser', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../scrapers/index', () => ({
  __esModule: true,
  default: [],
}));

jest.mock('next/config', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

// Mock the logger to prevent console output during tests
jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    isSuccessLoggingEnabled: jest.fn(() => true),
  },
}));

// Mock the API logging middleware
jest.mock('../../utils/apiLogging', () => ({
  withApiLogging: (handler: any) => handler,
}));

const encryptMock = jest.fn((value: string) => value);
const readFileMock = readFile as unknown as jest.Mock;
const verifyUserMock = verifyUser as unknown as jest.Mock;
const writeFileMock = writeFile as unknown as jest.Mock;
const getConfigMock = getConfig as unknown as jest.Mock;
const originalEnv = process.env;

jest.mock('cryptr', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    encrypt: encryptMock,
  })),
}));

describe('PUT /api/settings validation and errors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getConfigMock.mockReset();
    getConfigMock.mockReturnValue({ publicRuntimeConfig: { version: '1.0.0' } });
    process.env = { ...originalEnv, SECRET: 'secret' };
    verifyUserMock.mockReturnValue('authorized');
    encryptMock.mockClear();
    readFileMock.mockReset();
    writeFileMock.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 400 when settings payload is missing', async () => {
    const req = {
      method: 'PUT',
      body: {},
      headers: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    expect(verifyUserMock).toHaveBeenCalledWith(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Settings payload is required.' });
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('returns 500 when persisting encrypted settings fails', async () => {
    writeFileMock.mockRejectedValue(new Error('disk full'));

    const req = {
      method: 'PUT',
      body: { settings: { scraping_api: 'value', smtp_password: 'password' } },
      headers: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    expect(writeFileMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update settings.', details: 'disk full' });
  });
});

describe('GET /api/settings and configuration requirements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getConfigMock.mockReset();
    getConfigMock.mockReturnValue({ publicRuntimeConfig: { version: '1.0.0' } });
    process.env = { ...originalEnv, SECRET: 'secret' };
    verifyUserMock.mockReturnValue('authorized');
    encryptMock.mockClear();
    readFileMock.mockReset();
    writeFileMock.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns settings when loading settings succeeds', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({})).mockResolvedValueOnce(JSON.stringify([]));

    const req = {
      method: 'GET',
      headers: {},
      query: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    expect(verifyUserMock).toHaveBeenCalledWith(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      settings: expect.objectContaining({
        version: '1.0.0',
      }),
    });
  });

  it('returns settings when runtime config is missing', async () => {
    getConfigMock.mockReturnValue(undefined);
    readFileMock.mockResolvedValueOnce(JSON.stringify({})).mockResolvedValueOnce(JSON.stringify([]));

    const req = {
      method: 'GET',
      headers: {},
      query: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    expect(getConfigMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      settings: expect.objectContaining({
        version: undefined,
      }),
    });
  });

  it('returns settings successfully', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({})).mockResolvedValueOnce(JSON.stringify([]));

    const settings = await settingsApi.getAppSettings();

    expect(settings).toMatchObject({
      scraper_type: 'none',
      scraping_api: '',
      proxy: '',
      notification_interval: 'never',
      notification_email: '',
      notification_email_from: '',
      notification_email_from_name: platformName,
      smtp_server: '',
      smtp_port: '',
      smtp_username: '',
      smtp_password: '',
      scrape_interval: '',
      scrape_delay: '',
      scrape_retry: false,
      search_console: true,
      search_console_client_email: '',
      search_console_private_key: '',
      search_console_integrated: false,
      adwords_client_id: '',
      adwords_client_secret: '',
      adwords_refresh_token: '',
      adwords_developer_token: '',
      adwords_account_id: '',
      keywordsColumns: ['Best', 'History', 'Volume', 'Search Console'],
      available_scapers: [],
      failed_queue: [],
    });
  });

  it('returns defaults when files are missing', async () => {
    readFileMock
      .mockRejectedValueOnce(new Error('missing settings'))
      .mockRejectedValueOnce(new Error('missing failed queue'));
    writeFileMock.mockResolvedValue(undefined);

    const settings = await settingsApi.getAppSettings();

    expect(settings).toEqual(expect.objectContaining({
      scraper_type: 'none',
      available_scapers: expect.any(Array),
    }));
    expect(writeFileMock).toHaveBeenCalled();
  });

  it('recreates failed queue without overwriting settings', async () => {
    const settingsPayload = JSON.stringify({ scraper_type: 'serpapi' });
    const missingQueueError = Object.assign(new Error('missing failed queue'), { code: 'ENOENT' });

    readFileMock
      .mockResolvedValueOnce(settingsPayload)
      .mockRejectedValueOnce(missingQueueError);

    writeFileMock.mockResolvedValue(undefined);

    const settings = await settingsApi.getAppSettings();

    expect(settings.scraper_type).toBe('serpapi');
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock).toHaveBeenCalledWith(
      `${process.cwd()}/data/failed_queue.json`,
      JSON.stringify([]),
      { encoding: 'utf-8' },
    );
  });
});
