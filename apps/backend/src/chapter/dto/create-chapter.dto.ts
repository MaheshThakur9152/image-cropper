import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';

export class CreateChapterDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  importPath: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  height?: number;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  sensitivity?: number;

  @IsOptional()
  @IsInt()
  width?: number;

  @IsOptional()
  @IsInt()
  maxHeight?: number;

  @IsOptional()
  @IsInt()
  minHeight?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  divisionFactor?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  window?: number;
}
