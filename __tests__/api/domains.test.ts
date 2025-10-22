import type { NextApiRequest, NextApiResponse } from 'next';
import Cryptr from 'cryptr';
import handler from '../../pages/api/domains';
import db from '../../database/database';
import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import verifyUser from '../../utils/verifyUser';
import { removeLocalSCData } from '../../utils/searchConsole';

jest.mock('../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));

jest.mock('../../database/models/domain', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), destroy: jest.fn(), bulkCreate: jest.fn(), findAll: jest.fn() },
}));

jest.mock('../../database/models/keyword', () => ({
  __esModule: true,
  default: { destroy: jest.fn() },
}));

jest.mock('../../utils/verifyUser', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../utils/searchConsole', () => ({
  __esModule: true,
  checkSearchConsoleIntegration: jest.fn(() => ({ isValid: true })),
  removeLocalSCData: jest.fn(),
}));

jest.mock('../../utils/apiLogging', () => ({
  __esModule: true,
  withApiLogging: (apiHandler: any) => apiHandler,
}));

const verifyUserMock = verifyUser as unknown as jest.Mock;
const dbMock = db as unknown as { sync: jest.Mock };
const DomainMock = Domain as unknown as { findOne: jest.Mock; destroy: jest.Mock; bulkCreate: jest.Mock; findAll: jest.Mock };
const KeywordMock = Keyword as unknown as { destroy: jest.Mock };
const removeLocalSCDataMock = removeLocalSCData as unknown as jest.Mock;

const createMockResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
}) as unknown as NextApiResponse;

describe('GET /api/domains', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyUserMock.mockReturnValue('authorized');
    dbMock.sync.mockResolvedValue(undefined);
  });

  it('masks scraper overrides when returning the domain list', async () => {
    DomainMock.findAll.mockResolvedValue([
      {
        get: jest.fn().mockReturnValue({
          ID: 1,
          domain: 'example.com',
          slug: 'example-com',
          search_console: null,
          scraper_settings: JSON.stringify({ scraper_type: 'serpapi', scraping_api: 'encrypted-value' }),
        }),
      },
    ]);

    const req = { method: 'GET', headers: {}, query: {} } as unknown as NextApiRequest;
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.domains[0].scraper_settings).toEqual({ scraper_type: 'serpapi', has_api_key: true });
  });
});

describe('POST /api/domains', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyUserMock.mockReturnValue('authorized');
    dbMock.sync.mockResolvedValue(undefined);
  });

  it('rejects invalid or blank hostnames', async () => {
    const req = {
      method: 'POST',
      body: { domains: ['valid.com', '', 'bad host'] },
      headers: {},
    } as unknown as NextApiRequest;

    const res = createMockResponse();

    await handler(req, res);

    expect(DomainMock.bulkCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ domains: [], error: expect.stringContaining('Invalid domain') });
  });

  it('normalises and deduplicates hostnames before insert', async () => {
    const bulkCreateResult = [
      { get: jest.fn().mockReturnValue({ domain: 'example.com', slug: 'example-com' }) },
      { get: jest.fn().mockReturnValue({ domain: 'sub.domain.com', slug: 'sub-domain-com' }) },
    ];

    DomainMock.bulkCreate.mockResolvedValue(bulkCreateResult);

    const req = {
      method: 'POST',
      body: { domains: ['Example.com ', 'example.COM', 'sub.domain.com'] },
      headers: {},
    } as unknown as NextApiRequest;

    const res = createMockResponse();

    await handler(req, res);

    expect(DomainMock.bulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({ domain: 'example.com', slug: 'example-com' }),
      expect.objectContaining({ domain: 'sub.domain.com', slug: 'sub-domain-com' }),
    ]);
    expect(res.status).toHaveBeenCalledWith(201);
    const responsePayload = (res.json as jest.Mock).mock.calls[0][0];
    expect(responsePayload.domains).toEqual([
      { domain: 'example.com', slug: 'example-com' },
      { domain: 'sub.domain.com', slug: 'sub-domain-com' },
    ]);
  });
});

describe('PUT /api/domains', () => {
  let domainState: {
    domain: string;
    slug: string;
    scrapeEnabled: boolean;
    notification: boolean;
    scraper_settings: string | null;
  };
  let domainInstance: {
    get: jest.Mock;
    set: jest.Mock;
    save: jest.Mock;
  };
  let persistedSnapshots: Array<{ scrapeEnabled: number; notification: number }>;

  beforeEach(() => {
    jest.clearAllMocks();
    verifyUserMock.mockReturnValue('authorized');
    dbMock.sync.mockResolvedValue(undefined);
    process.env.SECRET = 'test-secret';

    persistedSnapshots = [];
    domainState = {
      domain: 'toggle-test.example.com',
      slug: 'toggle-test-slug',
      scrapeEnabled: true,
      notification: true,
      scraper_settings: null,
    };

    domainInstance = {
      get: jest.fn(() => ({ ...domainState })),
      set: jest.fn((updates: Partial<typeof domainState>) => {
        Object.assign(domainState, updates);
      }),
      save: jest.fn().mockImplementation(async () => {
        persistedSnapshots.push({
          scrapeEnabled: Number(domainState.scrapeEnabled),
          notification: Number(domainState.notification),
        });
        return domainInstance;
      }),
    };

    DomainMock.findOne.mockResolvedValue(domainInstance);
  });

  it('persists scrapeEnabled toggles and keeps notification in sync', async () => {
    const disableReq = {
      method: 'PUT',
      query: { domain: domainState.domain },
      body: { scrapeEnabled: false },
      headers: {},
    } as unknown as NextApiRequest;
    const disableRes = createMockResponse();

    await handler(disableReq, disableRes);

    expect(dbMock.sync).toHaveBeenCalledTimes(1);
    expect(DomainMock.findOne).toHaveBeenCalledWith({ where: { domain: domainState.domain } });
    expect(domainInstance.set).toHaveBeenCalledWith(expect.objectContaining({
      scrapeEnabled: false,
      notification: false,
    }));
    expect(domainInstance.save).toHaveBeenCalledTimes(1);
    expect(disableRes.status).toHaveBeenCalledWith(200);

    const disablePayload = (disableRes.json as jest.Mock).mock.calls[0][0];
    expect(disablePayload.domain).toBe(domainInstance);
    expect(domainState.scrapeEnabled).toBe(false);
    expect(domainState.notification).toBe(false);
    expect(persistedSnapshots[0]).toEqual({ scrapeEnabled: 0, notification: 0 });

    const enableReq = {
      method: 'PUT',
      query: { domain: domainState.domain },
      body: { scrapeEnabled: true },
      headers: {},
    } as unknown as NextApiRequest;
    const enableRes = createMockResponse();

    await handler(enableReq, enableRes);

    expect(DomainMock.findOne).toHaveBeenCalledTimes(2);
    expect(domainInstance.set).toHaveBeenLastCalledWith(expect.objectContaining({
      scrapeEnabled: true,
      notification: true,
    }));
    expect(domainInstance.save).toHaveBeenCalledTimes(2);
    expect(enableRes.status).toHaveBeenCalledWith(200);

    const enablePayload = (enableRes.json as jest.Mock).mock.calls[0][0];
    expect(enablePayload.domain).toBe(domainInstance);
    expect(domainState.scrapeEnabled).toBe(true);
    expect(domainState.notification).toBe(true);
    expect(persistedSnapshots[1]).toEqual({ scrapeEnabled: 1, notification: 1 });
  });

  it('returns 404 when attempting to update a non-existent domain', async () => {
    DomainMock.findOne.mockResolvedValueOnce(null);

    const req = {
      method: 'PUT',
      query: { domain: 'missing.example.com' },
      body: { scrapeEnabled: true },
      headers: {},
    } as unknown as NextApiRequest;

    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ domain: null, error: 'Domain not found' });
  });

  it('persists scraper override selections with encrypted API keys', async () => {
    const cryptr = new Cryptr(process.env.SECRET as string);
    domainState.scraper_settings = JSON.stringify({
      scraper_type: 'serpapi',
      scraping_api: cryptr.encrypt('old-key'),
    });

    const req = {
      method: 'PUT',
      query: { domain: domainState.domain },
      body: { scraper_settings: { scraper_type: 'serpapi', scraping_api: 'new-key' } },
      headers: {},
    } as unknown as NextApiRequest;

    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const updatePayload = domainInstance.set.mock.calls[domainInstance.set.mock.calls.length - 1][0];
    expect(updatePayload.scraper_settings).toEqual(expect.any(String));
    const persisted = JSON.parse(updatePayload.scraper_settings);
    expect(persisted.scraper_type).toBe('serpapi');
    expect(persisted.scraping_api).not.toBe('new-key');
    expect(cryptr.decrypt(persisted.scraping_api)).toBe('new-key');
  });

  it('removes scraper overrides when reverting to the system scraper', async () => {
    domainState.scraper_settings = JSON.stringify({ scraper_type: 'serpapi', scraping_api: 'value' });

    const req = {
      method: 'PUT',
      query: { domain: domainState.domain },
      body: { scraper_settings: { scraper_type: null } },
      headers: {},
    } as unknown as NextApiRequest;

    const res = createMockResponse();

    await handler(req, res);

    const updatePayload = domainInstance.set.mock.calls[domainInstance.set.mock.calls.length - 1][0];
    expect(updatePayload.scraper_settings).toBeNull();
  });
});

describe('DELETE /api/domains', () => {
  beforeEach(() => {
    verifyUserMock.mockReturnValue('authorized');
    dbMock.sync.mockResolvedValue(undefined);
    DomainMock.destroy.mockResolvedValue(1);
    KeywordMock.destroy.mockResolvedValue(0);
    removeLocalSCDataMock.mockResolvedValue(false);
  });

  it('returns 404 when the target domain is missing', async () => {
    DomainMock.destroy.mockResolvedValueOnce(0);

    const req = {
      method: 'DELETE',
      query: { domain: 'missing.example.com' },
      headers: {},
    } as unknown as NextApiRequest;

    const res = createMockResponse();

    await handler(req, res);

    expect(DomainMock.destroy).toHaveBeenCalledWith({ where: { domain: 'missing.example.com' } });
    expect(KeywordMock.destroy).not.toHaveBeenCalled();
    expect(removeLocalSCDataMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      domainRemoved: 0,
      keywordsRemoved: 0,
      SCDataRemoved: false,
      error: 'Domain not found',
    });
  });
});
