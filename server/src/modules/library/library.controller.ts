import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { LibraryService } from './library.service';
import { MaterialQueryDto } from './dto/material-query.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';

/**
 * 素材库控制器（T4.3）。全资源经 AccessTokenGuard 鉴权。
 * 路径顺序：静态路由（deleted/tags）必须先于 /:id 参数路由注册，避免被 :id 抢占。
 */
@Controller('library')
@UseGuards(AccessTokenGuard)
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  overview(): Record<string, string> {
    return { module: 'library', label: '素材库', status: 'ready', features: 'search,filter,graph,favorite,tag,archive,recycle' };
  }

  @Get('materials')
  search(@Query() q: MaterialQueryDto) {
    return this.library.searchMaterials(q as Record<string, any>);
  }

  @Get('materials/tags')
  tags() {
    return this.library.listTags();
  }

  @Get('materials/deleted')
  deleted() {
    return this.library.listDeleted();
  }

  @Get('materials/:id/graph')
  graph(@Param('id') id: string) {
    return this.library.getMaterialGraph(id);
  }

  @Get('materials/:id')
  detail(@Param('id') id: string) {
    return this.library.getMaterial(id);
  }

  @Patch('materials/:id')
  update(@Param('id') id: string, @Body() dto: UpdateMaterialDto) {
    return this.library.updateMaterial(id, dto);
  }

  @Delete('materials/:id')
  remove(@Param('id') id: string) {
    return this.library.softDeleteMaterial(id);
  }

  @Post('materials/:id/restore')
  restore(@Param('id') id: string) {
    return this.library.restoreMaterial(id);
  }
}
