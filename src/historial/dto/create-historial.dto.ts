import { IsInt, IsPositive } from 'class-validator';

export class CreateHistorialDto {
  @IsInt()
  @IsPositive()
  recetaId: number;
}
