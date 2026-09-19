import { IsInt, IsPositive } from 'class-validator';

export class CreateFavoritoDto {
  @IsInt()
  @IsPositive()
  recetaId: number;
}
