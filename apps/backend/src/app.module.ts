import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectModule } from './project/project.module';
import { ChapterModule } from './chapter/chapter.module';
import { PanelModule } from './panel/panel.module';

@Module({
  imports: [PrismaModule, ProjectModule, ChapterModule, PanelModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
