import { Test, TestingModule } from '@nestjs/testing';
import { ProjectService } from './project.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  rmSync: jest.fn(),
}));

describe('ProjectService', () => {
  let service: ProjectService;
  let prisma: PrismaService;

  const mockPrismaService = {
    project: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ProjectService>(ProjectService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a project and directories', async () => {
      const dto = { name: 'Test Project' };
      const createdProject = { id: 'uuid-123', name: 'Test Project', createdAt: new Date() };

      mockPrismaService.project.create.mockResolvedValue(createdProject);

      const result = await service.create(dto);

      expect(prisma.project.create).toHaveBeenCalledWith({ data: { name: dto.name } });
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(result).toEqual(createdProject);
    });
  });

  describe('findOne', () => {
    it('should return project if found', async () => {
      const project = { id: 'uuid-123', name: 'Test Project', chapters: [] };
      mockPrismaService.project.findUnique.mockResolvedValue(project);

      const result = await service.findOne('uuid-123');

      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'uuid-123' },
        include: expect.any(Object),
      });
      expect(result).toEqual(project);
    });

    it('should throw NotFoundException if project not found', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(null);

      await expect(service.findOne('uuid-invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete project database record and remove filesystem directory', async () => {
      const project = { id: 'uuid-123', name: 'Deleted Project' };
      mockPrismaService.project.findUnique.mockResolvedValue(project);
      mockPrismaService.project.delete.mockResolvedValue(project);

      const result = await service.remove('uuid-123');

      expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: 'uuid-123' } });
      expect(fs.rmSync).toHaveBeenCalled();
      expect(result).toEqual(project);
    });
  });
});
