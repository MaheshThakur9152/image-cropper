import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChapterDto } from './dto/create-chapter.dto';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip = require('adm-zip');
import sizeOf from 'image-size';

@Injectable()
export class ChapterService {
  private readonly storageBase = 'd:\\manhwa\\projects';
  private readonly pythonApiUrl = process.env.PYTHON_API_URL || 'http://localhost:8000';

  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, dto: CreateChapterDto) {
    // 1. Verify project exists
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Project with ID "${projectId}" not found`);
    }

    // 2. Verify import source path exists
    if (!fs.existsSync(dto.importPath)) {
      throw new BadRequestException(`Import path does not exist: ${dto.importPath}`);
    }

    // 3. Create chapter record in database
    const chapter = await this.prisma.chapter.create({
      data: {
        projectId,
        title: dto.title,
        status: 'PENDING',
      },
    });

    const projectPath = path.join(this.storageBase, projectId);
    const rawsChapterPath = path.join(projectPath, 'raws', chapter.id);
    const panelsChapterPath = path.join(projectPath, 'panels', chapter.id);

    try {
      // Create destination directories
      fs.mkdirSync(rawsChapterPath, { recursive: true });
      fs.mkdirSync(panelsChapterPath, { recursive: true });
      // 4. Extract or copy raw assets
      const isZip = fs.statSync(dto.importPath).isFile() && dto.importPath.endsWith('.zip');
      if (isZip) {
        const zip = new AdmZip(dto.importPath);
        zip.extractAllTo(rawsChapterPath, true);
        // Flatten folder in case ZIP had a nested directory structure
        this.flattenDirectory(rawsChapterPath, rawsChapterPath);
        this.cleanupSubdirectories(rawsChapterPath);
      } else {
        // If it's a directory, copy files
        if (fs.statSync(dto.importPath).isDirectory()) {
          this.flattenDirectory(dto.importPath, rawsChapterPath);
        } else {
          throw new BadRequestException('Import path is neither a ZIP file nor a folder');
        }
      }
      // 5. Invoke Python Sidecar StitchToon slicing
      const payload = {
        input_path: rawsChapterPath,
        output_path: panelsChapterPath,
        method: dto.method || 'pixel',
        height: dto.height || 2000,
        width: dto.width || null,
        sensitivity: dto.sensitivity || 90,
        max_height: dto.maxHeight || -1,
        min_height: dto.minHeight || -1,
        division_factor: dto.divisionFactor || 1,
        window: dto.window || 1,
        img_format: 'png',
      };

      console.log(`Sending slicing request to Python sidecar: ${this.pythonApiUrl}/slice`);
      const response = await fetch(`${this.pythonApiUrl}/slice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errDetail = await response.text();
        throw new Error(`Slicing failed: ${errDetail}`);
      }

      // 6. Scan output folder and create Panel records
      const files = fs.readdirSync(panelsChapterPath);
      const imageFiles = files
        .filter((file) => /\.(png|jpg|jpeg|webp|bmp)$/i.test(file))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

      if (imageFiles.length === 0) {
        throw new Error('Slicing completed, but no panels were generated');
      }

      const panelData = imageFiles.map((file, idx) => {
        const absolutePath = path.join(panelsChapterPath, file);
        const relativePath = path.join('projects', projectId, 'panels', chapter.id, file);
        const dimensions = sizeOf(fs.readFileSync(absolutePath));

        return {
          chapterId: chapter.id,
          panelNumber: idx + 1,
          filePath: relativePath.replace(/\\/g, '/'), // use forward slashes for cross-platform
          width: dimensions.width || 0,
          height: dimensions.height || 0,
        };
      });

      // Insert panels into DB
      await this.prisma.panel.createMany({
        data: panelData,
      });

      // Update chapter status to Sliced
      return this.prisma.chapter.update({
        where: { id: chapter.id },
        data: { status: 'SLICED' },
        include: { panels: true },
      });

    } catch (error) {
      console.error(`Error processing chapter ${chapter.id}:`, error);
      // Update chapter status to FAILED in case of any failure
      await this.prisma.chapter.update({
        where: { id: chapter.id },
        data: { status: 'FAILED' },
      });
      throw new InternalServerErrorException(`Failed to process chapter: ${error.message}`);
    }
  }

  async remove(id: string) {
    const chapter = await this.prisma.chapter.findUnique({ where: { id } });
    if (!chapter) {
      throw new NotFoundException(`Chapter with ID "${id}" not found`);
    }

    // Delete from DB (Prisma cascade delete cleans up panels)
    await this.prisma.chapter.delete({ where: { id } });

    // Clean up directories
    const projectPath = path.join(this.storageBase, chapter.projectId);
    const rawsPath = path.join(projectPath, 'raws', chapter.id);
    const panelsPath = path.join(projectPath, 'panels', chapter.id);

    try {
      if (fs.existsSync(rawsPath)) {
        fs.rmSync(rawsPath, { recursive: true, force: true });
      }
      if (fs.existsSync(panelsPath)) {
        fs.rmSync(panelsPath, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`Failed to delete filesystem folders for chapter ${chapter.id}:`, err);
    }

    return chapter;
  }

  private flattenDirectory(dir: string, destDir: string) {
    const extRegex = /\.(jpg|jpeg|png|webp|bmp)$/i;
    const traverse = (currentDir: string) => {
      const items = fs.readdirSync(currentDir);
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          traverse(fullPath);
        } else if (stat.isFile() && extRegex.test(item)) {
          const destPath = path.join(destDir, item);
          if (fullPath !== destPath) {
            fs.copyFileSync(fullPath, destPath);
          }
        }
      }
    };
    traverse(dir);
  }

  private cleanupSubdirectories(dir: string) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
    }
  }

  async exportChapter(chapterId: string) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { panels: true }
    });
    if (!chapter) {
      throw new NotFoundException(`Chapter with ID "${chapterId}" not found`);
    }

    const activePanels = await this.prisma.panel.findMany({
      where: {
        chapterId,
        isDeleted: false
      },
      orderBy: {
        panelNumber: 'asc'
      }
    });

    const exportPath = path.join(this.storageBase, chapter.projectId, 'exports', chapter.id);
    if (fs.existsSync(exportPath)) {
      fs.rmSync(exportPath, { recursive: true, force: true });
    }
    fs.mkdirSync(exportPath, { recursive: true });

    for (let i = 0; i < activePanels.length; i++) {
      const panel = activePanels[i];
      const srcAbs = path.join(this.storageBase, panel.filePath);
      const filename = `${String(i + 1).padStart(3, '0')}.png`;
      const destAbs = path.join(exportPath, filename);

      if (!fs.existsSync(srcAbs)) {
        console.warn(`Source file not found for panel ${panel.id} at ${srcAbs}`);
        continue;
      }

      if (panel.cropBox) {
        try {
          const cropBox = JSON.parse(panel.cropBox);
          const response = await fetch(`${this.pythonApiUrl}/crop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image_path: srcAbs,
              output_path: destAbs,
              x: cropBox.x,
              y: cropBox.y,
              width: cropBox.width,
              height: cropBox.height
            })
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Crop failed on Python side: ${errText}`);
          }
        } catch (err) {
          console.error(`Failed to crop panel ${panel.id}, copying original:`, err);
          fs.copyFileSync(srcAbs, destAbs);
        }
      } else {
        fs.copyFileSync(srcAbs, destAbs);
      }
    }

    // Save local metadata.json in the export directory
    const exportMetadataPath = path.join(exportPath, 'metadata.json');
    const metadata = {
      chapterId: chapter.id,
      title: chapter.title,
      exportedAt: new Date().toISOString(),
      panels: activePanels.map((p, idx) => ({
        originalId: p.id,
        panelNumber: idx + 1,
        width: p.width,
        height: p.height,
        cropBox: p.cropBox ? JSON.parse(p.cropBox) : null
      }))
    };
    fs.writeFileSync(exportMetadataPath, JSON.stringify(metadata, null, 2));

    return {
      status: 'success',
      exportPath: exportPath.replace(/\\/g, '/'),
      totalPanels: activePanels.length
    };
  }

  async getProjectMetadata(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        chapters: {
          include: {
            panels: {
              orderBy: {
                panelNumber: 'asc'
              }
            }
          }
        }
      }
    });

    if (!project) {
      throw new NotFoundException(`Project with ID "${projectId}" not found`);
    }

    const projectPath = path.join(this.storageBase, projectId);
    fs.mkdirSync(projectPath, { recursive: true });
    const metadataPath = path.join(projectPath, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(project, null, 2));

    return project;
  }
}

