import { IsString, IsUUID, IsOptional, MaxLength } from 'class-validator';

export class CreateCommitDto {
  @IsString()
  @MaxLength(40)
  sha!: string;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsString()
  @MaxLength(5000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  branch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  repo?: string;
}
