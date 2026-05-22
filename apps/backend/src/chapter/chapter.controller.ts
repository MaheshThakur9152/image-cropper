import { Controller, Post, Delete, Get, Body, Param } from '@nestjs/common';
import { ChapterService } from './chapter.service';
import { CreateChapterDto } from './dto/create-chapter.dto';

@Controller()
export class ChapterController {
  constructor(private readonly chapterService: ChapterService) {}

  @Post('projects/:projectId/chapters')
  create(
    @Param('projectId') projectId: string,
    @Body() createChapterDto: CreateChapterDto
  ) {
    return this.chapterService.create(projectId, createChapterDto);
  }

  @Delete('chapters/:id')
  remove(@Param('id') id: string) {
    return this.chapterService.remove(id);
  }

  @Post('chapters/:id/export')
  exportChapter(@Param('id') id: string) {
    return this.chapterService.exportChapter(id);
  }

  @Get('projects/:projectId/metadata')
  getProjectMetadata(@Param('projectId') projectId: string) {
    return this.chapterService.getProjectMetadata(projectId);
  }
}
