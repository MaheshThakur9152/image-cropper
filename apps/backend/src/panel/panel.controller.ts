import { Controller, Get, Param, Patch, Post, Delete, Body, Query } from '@nestjs/common';
import { PanelService } from './panel.service';

@Controller()
export class PanelController {
  constructor(private readonly panelService: PanelService) {}

  @Get('chapters/:chapterId/panels')
  findByChapter(
    @Param('chapterId') chapterId: string,
    @Query('includeDeleted') includeDeleted?: string
  ) {
    return this.panelService.findByChapter(chapterId, includeDeleted === 'true');
  }

  @Patch('panels/:id/crop')
  crop(
    @Param('id') id: string,
    @Body() body: { cropBox: { x: number; y: number; width: number; height: number } | null }
  ) {
    return this.panelService.crop(id, body.cropBox);
  }

  @Post('panels/:id/split')
  split(
    @Param('id') id: string,
    @Body() body: { splitY: number }
  ) {
    return this.panelService.split(id, body.splitY);
  }

  @Post('panels/merge')
  merge(
    @Body() body: { panelIds: string[] }
  ) {
    return this.panelService.merge(body.panelIds);
  }

  @Delete('panels/:id')
  remove(@Param('id') id: string) {
    return this.panelService.remove(id);
  }

  @Post('panels/:id/restore')
  restore(@Param('id') id: string) {
    return this.panelService.restore(id);
  }
}
