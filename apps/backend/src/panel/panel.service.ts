import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class PanelService {
  private readonly storageBase = 'd:\\manhwa';
  private readonly pythonApiUrl = process.env.PYTHON_API_URL || 'http://localhost:8000';

  constructor(private readonly prisma: PrismaService) {}

  async findByChapter(chapterId: string, includeDeleted = false) {
    const chapter = await this.prisma.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter) {
      throw new NotFoundException(`Chapter with ID "${chapterId}" not found`);
    }

    return this.prisma.panel.findMany({
      where: {
        chapterId,
        ...(includeDeleted ? {} : { isDeleted: false }),
      },
      orderBy: {
        panelNumber: 'asc',
      },
    });
  }

  async crop(id: string, cropBox: { x: number; y: number; width: number; height: number } | null) {
    const panel = await this.prisma.panel.findUnique({ where: { id } });
    if (!panel) {
      throw new NotFoundException(`Panel with ID "${id}" not found`);
    }

    const cropBoxStr = cropBox ? JSON.stringify(cropBox) : null;

    return this.prisma.panel.update({
      where: { id },
      data: {
        cropBox: cropBoxStr,
      },
    });
  }

  async split(id: string, splitY: number) {
    const panel = await this.prisma.panel.findUnique({ where: { id } });
    if (!panel) {
      throw new NotFoundException(`Panel with ID "${id}" not found`);
    }

    const absolutePath = path.join(this.storageBase, panel.filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException(`Panel file not found on disk at: ${absolutePath}`);
    }

    const outputDir = path.dirname(absolutePath);

    try {
      const response = await fetch(`${this.pythonApiUrl}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_path: absolutePath,
          split_y: splitY,
          output_dir: outputDir,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Python sidecar split failed: ${errText}`);
      }

      const result = (await response.json()) as {
        status: string;
        parts: { filename: string; width: number; height: number }[];
      };

      const [part1, part2] = result.parts;

      const relativeDir = path.dirname(panel.filePath).replace(/\\/g, '/');
      const relPath1 = `${relativeDir}/${part1.filename}`;
      const relPath2 = `${relativeDir}/${part2.filename}`;

      const N = panel.panelNumber;

      return await this.prisma.$transaction(async (tx) => {
        // Soft delete the original panel
        await tx.panel.update({
          where: { id },
          data: { isDeleted: true },
        });

        // Shift subsequent panel numbers up by 1
        await tx.panel.updateMany({
          where: {
            chapterId: panel.chapterId,
            panelNumber: { gt: N },
            isDeleted: false,
          },
          data: {
            panelNumber: { increment: 1 },
          },
        });

        // Insert part 1
        const newPanel1 = await tx.panel.create({
          data: {
            chapterId: panel.chapterId,
            panelNumber: N,
            filePath: relPath1,
            width: part1.width,
            height: part1.height,
          },
        });

        // Insert part 2
        await tx.panel.create({
          data: {
            chapterId: panel.chapterId,
            panelNumber: N + 1,
            filePath: relPath2,
            width: part2.width,
            height: part2.height,
          },
        });

        return newPanel1;
      });
    } catch (error) {
      console.error('Error splitting panel:', error);
      throw new InternalServerErrorException(`Split failed: ${error.message}`);
    }
  }

  async merge(panelIds: string[]) {
    if (panelIds.length < 2) {
      throw new BadRequestException('At least two panels are required to merge');
    }

    const panels = await this.prisma.panel.findMany({
      where: {
        id: { in: panelIds },
        isDeleted: false,
      },
      orderBy: {
        panelNumber: 'asc',
      },
    });

    if (panels.length !== panelIds.length) {
      throw new BadRequestException('Some panels could not be found or are already deleted');
    }

    const chapterId = panels[0].chapterId;
    for (let i = 0; i < panels.length; i++) {
      if (panels[i].chapterId !== chapterId) {
        throw new BadRequestException('All panels must belong to the same chapter');
      }
      if (i > 0 && panels[i].panelNumber !== panels[i - 1].panelNumber + 1) {
        throw new BadRequestException('Panels must be contiguous to merge');
      }
    }

    const imagePaths = panels.map((p) => path.join(this.storageBase, p.filePath));
    const firstPanelAbs = imagePaths[0];
    const outputDir = path.dirname(firstPanelAbs);
    const outputFilename = `merged_${Date.now()}.png`;
    const outputPath = path.join(outputDir, outputFilename);

    try {
      const response = await fetch(`${this.pythonApiUrl}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_paths: imagePaths,
          output_path: outputPath,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Python sidecar merge failed: ${errText}`);
      }

      const result = (await response.json()) as {
        status: string;
        output_path: string;
        width: number;
        height: number;
      };

      const relativeDir = path.dirname(panels[0].filePath).replace(/\\/g, '/');
      const relativeMergedPath = `${relativeDir}/${outputFilename}`;

      const N_1 = panels[0].panelNumber;
      const N_k = panels[panels.length - 1].panelNumber;
      const k = panels.length;

      return await this.prisma.$transaction(async (tx) => {
        // Soft delete all merged panels
        await tx.panel.updateMany({
          where: {
            id: { in: panelIds },
          },
          data: { isDeleted: true },
        });

        // Decrement panelNumber by k-1 for panels with panelNumber > N_k
        await tx.panel.updateMany({
          where: {
            chapterId,
            panelNumber: { gt: N_k },
            isDeleted: false,
          },
          data: {
            panelNumber: { decrement: k - 1 },
          },
        });

        // Create new merged panel
        return await tx.panel.create({
          data: {
            chapterId,
            panelNumber: N_1,
            filePath: relativeMergedPath,
            width: result.width,
            height: result.height,
          },
        });
      });
    } catch (error) {
      console.error('Error merging panels:', error);
      throw new InternalServerErrorException(`Merge failed: ${error.message}`);
    }
  }

  async remove(id: string) {
    const panel = await this.prisma.panel.findUnique({ where: { id } });
    if (!panel) {
      throw new NotFoundException(`Panel with ID "${id}" not found`);
    }

    const N = panel.panelNumber;

    return await this.prisma.$transaction(async (tx) => {
      // Soft delete panel
      const updated = await tx.panel.update({
        where: { id },
        data: { isDeleted: true },
      });

      // Shift subsequent panel numbers down by 1
      await tx.panel.updateMany({
        where: {
          chapterId: panel.chapterId,
          panelNumber: { gt: N },
          isDeleted: false,
        },
        data: {
          panelNumber: { decrement: 1 },
        },
      });

      return updated;
    });
  }

  async restore(id: string) {
    const panel = await this.prisma.panel.findUnique({ where: { id } });
    if (!panel) {
      throw new NotFoundException(`Panel with ID "${id}" not found`);
    }

    if (!panel.isDeleted) {
      return panel;
    }

    const activePanels = await this.prisma.panel.findMany({
      where: {
        chapterId: panel.chapterId,
        isDeleted: false,
      },
      orderBy: {
        panelNumber: 'desc',
      },
      take: 1,
    });

    const nextNum = activePanels.length > 0 ? activePanels[0].panelNumber + 1 : 1;

    return this.prisma.panel.update({
      where: { id },
      data: {
        isDeleted: false,
        panelNumber: nextNum,
      },
    });
  }
}
