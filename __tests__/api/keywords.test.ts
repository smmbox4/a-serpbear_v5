import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import handler from '../../pages/api/keywords';
import db from '../../database/database';
import Keyword from '../../database/models/keyword';
import verifyUser from '../../utils/verifyUser';
import { getAppSettings } from '../../pages/api/settings';
import { getKeywordsVolume, updateKeywordsVolumeData } from '../../utils/adwords';

jest.mock('../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));

jest.mock('../../database/models/keyword', () => ({
  __esModule: true,
  default: {
    update: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    bulkCreate: jest.fn(),
    destroy: jest.fn(),
  },
}));

jest.mock('../../utils/verifyUser', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../utils/refresh', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../pages/api/settings', () => ({
  __esModule: true,
  getAppSettings: jest.fn(),
}));

jest.mock('../../utils/adwords', () => ({
  __esModule: true,
  getKeywordsVolume: jest.fn(),
  updateKeywordsVolumeData: jest.fn(),
}));

jest.mock('../../scrapers/index', () => ({
  __esModule: true,
  default: [],
}));

const dbMock = db as unknown as { sync: jest.Mock };
const keywordMock = Keyword as unknown as {
  update: jest.Mock;
  findAll: jest.Mock;
  findOne: jest.Mock;
  bulkCreate: jest.Mock;
  destroy: jest.Mock;
};
const verifyUserMock = verifyUser as unknown as jest.Mock;
const getAppSettingsMock = getAppSettings as unknown as jest.Mock;
const getKeywordsVolumeMock = getKeywordsVolume as unknown as jest.Mock;
const updateKeywordsVolumeDataMock = updateKeywordsVolumeData as unknown as jest.Mock;

describe('PUT /api/keywords error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dbMock.sync.mockResolvedValue(undefined);
    verifyUserMock.mockReturnValue('authorized');
    getAppSettingsMock.mockResolvedValue({
      adwords_account_id: 'acct',
      adwords_client_id: 'client',
      adwords_client_secret: 'secret',
      adwords_developer_token: 'token',
    });
    getKeywordsVolumeMock.mockResolvedValue({ volumes: false });
    updateKeywordsVolumeDataMock.mockResolvedValue(true);
  });

  it('returns 500 when keyword update fails', async () => {
    const failure = new Error('update failed');
    keywordMock.update.mockRejectedValueOnce(failure);

    const req = {
      method: 'PUT',
      query: { id: '1' },
      body: { sticky: true },
      headers: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    expect(dbMock.sync).toHaveBeenCalled();
    expect(verifyUserMock).toHaveBeenCalledWith(req, res);
    expect(keywordMock.update).toHaveBeenCalledWith({ sticky: true }, { where: { ID: { [Op.in]: [1] } } });
    expect(keywordMock.findAll).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update keywords.', details: 'update failed' });
  });

  it('returns 500 when keyword volume update fails after creation', async () => {
    const newKeywordRecord = {
      get: () => ({
        ID: 1,
        keyword: 'alpha',
        history: '{}',
        tags: '[]',
        lastResult: '[]',
        lastUpdateError: 'false',
        device: 'desktop',
        domain: 'example.com',
        country: 'US',
      }),
    };
    keywordMock.bulkCreate.mockResolvedValue([newKeywordRecord]);
    keywordMock.findAll.mockResolvedValue([]);
    getKeywordsVolumeMock.mockResolvedValue({ volumes: { 1: 100 } });
    const volumeFailure = new Error('volume failure');
    updateKeywordsVolumeDataMock.mockRejectedValue(volumeFailure);

    const req = {
      method: 'POST',
      body: { keywords: [{ keyword: 'alpha', device: 'desktop', country: 'US', domain: 'example.com' }] },
      headers: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    expect(keywordMock.bulkCreate).toHaveBeenCalled();
    expect(getAppSettingsMock).toHaveBeenCalled();
    expect(getKeywordsVolumeMock).toHaveBeenCalled();
    expect(updateKeywordsVolumeDataMock).toHaveBeenCalledWith({ 1: 100 });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to add keywords.', details: 'volume failure' });
  });

  it('returns 400 when keyword payload is missing', async () => {
    const req = {
      method: 'POST',
      body: {},
      headers: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ 
      error: 'Keywords array is required', 
      details: 'Request body must contain a keywords array' 
    });
    expect(keywordMock.bulkCreate).not.toHaveBeenCalled();
  });

  it('deduplicates keyword tags before persistence', async () => {
    const now = new Date().toJSON();
    const bulkCreateResult = [{
      get: () => ({
        ID: 10,
        keyword: 'alpha',
        history: '{}',
        tags: JSON.stringify(['Primary', 'secondary']),
        lastResult: '[]',
        lastUpdateError: 'false',
        device: 'desktop',
        domain: 'example.com',
        country: 'US',
        added: now,
        lastUpdated: now,
      }),
    }];

    keywordMock.bulkCreate.mockResolvedValue(bulkCreateResult);
    getKeywordsVolumeMock.mockResolvedValue({ volumes: false });

    const req = {
      method: 'POST',
      body: {
        keywords: [{
          keyword: 'alpha',
          device: 'desktop',
          country: 'US',
          domain: 'example.com',
          tags: 'Primary, secondary, primary, SECONDARY',
        }],
      },
      headers: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    expect(keywordMock.bulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({
        tags: JSON.stringify(['Primary', 'secondary']),
      }),
    ]);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('PUT /api/keywords tags updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dbMock.sync.mockResolvedValue(undefined);
    verifyUserMock.mockReturnValue('authorized');
  });

  it('returns refreshed keyword data when tags are updated', async () => {
    const firstUpdate = jest.fn().mockResolvedValue(undefined);
    const secondUpdate = jest.fn().mockResolvedValue(undefined);

    keywordMock.findOne
      .mockResolvedValueOnce({ tags: JSON.stringify(['existing']), update: firstUpdate })
      .mockResolvedValueOnce({ tags: JSON.stringify([]), update: secondUpdate });

    keywordMock.findAll.mockResolvedValueOnce([
      {
        get: () => ({
          ID: 1,
          keyword: 'alpha',
          domain: 'example.com',
          device: 'desktop',
          country: 'US',
          location: '',
          history: '{}',
          tags: JSON.stringify(['existing', 'new']),
          lastResult: '[]',
          lastUpdateError: 'false',
          sticky: false,
          updating: false,
          mapPackTop3: false,
        }),
      },
      {
        get: () => ({
          ID: 2,
          keyword: 'beta',
          domain: 'example.com',
          device: 'desktop',
          country: 'US',
          location: '',
          history: '{}',
          tags: JSON.stringify(['second']),
          lastResult: '[]',
          lastUpdateError: 'false',
          sticky: false,
          updating: false,
          mapPackTop3: false,
        }),
      },
    ]);

    const req = {
      method: 'PUT',
      query: { id: '1,2' },
      body: { tags: { 1: ['new'], 2: ['second'] } },
      headers: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    expect(keywordMock.findOne).toHaveBeenNthCalledWith(1, { where: { ID: 1 } });
    expect(keywordMock.findOne).toHaveBeenNthCalledWith(2, { where: { ID: 2 } });
    expect(firstUpdate).toHaveBeenCalledWith({ tags: JSON.stringify(['existing', 'new']) });
    expect(secondUpdate).toHaveBeenCalledWith({ tags: JSON.stringify(['second']) });
    expect(keywordMock.findAll).toHaveBeenCalledWith({ where: { ID: { [Op.in]: [1, 2] } } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      keywords: expect.arrayContaining([
        expect.objectContaining({ keyword: 'alpha', tags: ['existing', 'new'] }),
        expect.objectContaining({ keyword: 'beta', tags: ['second'] }),
      ]),
    });
  });

  it('treats an empty tags object as a successful no-op', async () => {
    const req = {
      method: 'PUT',
      query: { id: '1' },
      body: { tags: {} },
      headers: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    expect(keywordMock.findOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ keywords: [] });
  });

  it('clears persisted tags when provided with empty arrays', async () => {
    const updateSpy = jest.fn().mockResolvedValue(undefined);
    keywordMock.findOne.mockResolvedValueOnce({ tags: JSON.stringify(['keep']), update: updateSpy });
    keywordMock.findAll.mockResolvedValueOnce([
      {
        get: () => ({
          ID: 5,
          keyword: 'gamma',
          domain: 'example.com',
          device: 'desktop',
          country: 'US',
          location: '',
          history: '{}',
          tags: JSON.stringify([]),
          lastResult: '[]',
          lastUpdateError: 'false',
          sticky: false,
          updating: false,
          mapPackTop3: false,
        }),
      },
    ]);

    const req = {
      method: 'PUT',
      query: { id: '5' },
      body: { tags: { 5: [] } },
      headers: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    expect(updateSpy).toHaveBeenCalledWith({ tags: JSON.stringify([]) });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      keywords: expect.arrayContaining([
        expect.objectContaining({ keyword: 'gamma', tags: [] }),
      ]),
    });
  });
});
