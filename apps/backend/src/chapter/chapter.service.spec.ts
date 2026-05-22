import { Test, TestingModule } from '@nestjs/testing';
import { ChapterService } from './chapter.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  rmSync: jest.fn(),
  statSync: jest.fn(() => ({
    isFile: () => false,
    isDirectory: () => true,
  })),
  readdirSync: jest.fn(() => ['001.png']),
  copyFileSync: jest.fn(),
  readFileSync: jest.fn(() => Buffer.from('mock-image-data')),
}));

// Mock image-size
jest.mock('image-size', () => {
  return jest.fn(() => ({ width: 800, height: 1200 }));
});

describe('ChapterService', () => {
  let service: ChapterService;
  let prisma: PrismaService;

  const mockPrismaService = {
    project: {
      findUnique: jest.fn(),
    },
    chapter: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    panel: {
      createMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChapterService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ChapterService>(ChapterService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should throw NotFoundException if project does not exist', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(null);

      await expect(
        service.create('invalid-project-id', {
          title: 'Ch 1',
          importPath: 'd:/path/to/raws',
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('should successfully run slicing pipeline when project exists', async () => {
      const project = { id: 'project-123', name: 'Test Project' };
      const pendingChapter = { id: 'chapter-123', title: 'Ch 1', status: 'PENDING' };
      const slicedChapter = { id: 'chapter-123', title: 'Ch 1', status: 'SLICED' };

      mockPrismaService.project.findUnique.mockResolvedValue(project);
      mockPrismaService.chapter.create.mockResolvedValue(pendingChapter);
      mockPrismaService.chapter.update.mockResolvedValue(slicedChapter);

      // Mock global fetch for sidecar slicing api
      const mockFetchResponse = {
        ok: true,
        json: async () => ({ status: 'success' }),
      };
      global.fetch = jest.fn().mockResolvedValue(mockFetchResponse);

      const result = await service.create('project-123', {
        title: 'Ch 1',
        importPath: 'd:/path/to/raws',
      });

      expect(prisma.project.findUnique).toHaveBeenCalledWith({ where: { id: 'project-123' } });
      expect(prisma.chapter.create).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalled();
      expect(prisma.panel.createMany).toHaveBeenCalled();
      expect(prisma.chapter.update).toHaveBeenCalledWith({
        where: { id: 'chapter-123' },
        data: { status: 'SLICED' },
        include: { panels: true },
      });
      expect(result).toEqual(slicedChapter);
    });
  });
});
