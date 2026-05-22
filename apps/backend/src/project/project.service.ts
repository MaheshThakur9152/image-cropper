import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ProjectService {
  private readonly storageBase = 'd:\\manhwa\\projects';

  constructor(private readonly prisma: PrismaService) {
    // Ensure base storage directory exists
    if (!fs.existsSync(this.storageBase)) {
      fs.mkdirSync(this.storageBase, { recursive: true });
    }
  }

  async create(createProjectDto: CreateProjectDto) {
    const project = await this.prisma.project.create({
      data: {
        name: createProjectDto.name,
      },
    });

    const projectPath = path.join(this.storageBase, project.id);
    const rawsPath = path.join(projectPath, 'raws');
    const panelsPath = path.join(projectPath, 'panels');

    try {
      fs.mkdirSync(projectPath, { recursive: true });
      fs.mkdirSync(rawsPath, { recursive: true });
      fs.mkdirSync(panelsPath, { recursive: true });
    } catch (error) {
      // If filesystem creation fails, clean up the DB record and throw
      await this.prisma.project.delete({ where: { id: project.id } });
      throw new InternalServerErrorException(`Failed to create project directories: ${error.message}`);
    }

    return project;
  }

  async findAll() {
    return this.prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { chapters: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        chapters: {
          orderBy: { createdAt: 'desc' },
          include: {
            _count: {
              select: { panels: true },
            },
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID "${id}" not found`);
    }

    return project;
  }

  async update(id: string, updateProjectDto: UpdateProjectDto) {
    // Check if project exists
    await this.findOne(id);

    return this.prisma.project.update({
      where: { id },
      data: {
        name: updateProjectDto.name,
      },
    });
  }

  async remove(id: string) {
    // Check if project exists
    await this.findOne(id);

    // Delete database record first (Prisma will cascade delete chapters and panels)
    const project = await this.prisma.project.delete({
      where: { id },
    });

    // Clean up project directories on filesystem
    const projectPath = path.join(this.storageBase, id);
    try {
      if (fs.existsSync(projectPath)) {
        fs.rmSync(projectPath, { recursive: true, force: true });
      }
    } catch (error) {
      // Log error but do not block since the DB record is already deleted
      console.error(`Failed to delete project folder for ${id}:`, error);
    }

    return project;
  }
}
