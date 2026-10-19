import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';

export const MOMENTOS = ['desayuno', 'almuerzo', 'cena'] as const;
export type Momento = (typeof MOMENTOS)[number];

export class FindRecetasDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  categoriaId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string; // búsqueda por nombre

  // Filtra las recetas que encajan en ese momento del día. Lo usa la ruleta
  // de acompañante para ofrecer solo las bebidas del desayuno, almuerzo o cena.
  @IsOptional()
  @IsIn(MOMENTOS)
  momento?: Momento;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page?: number = 1;
}
