import { IsString, IsUUID, IsInt, IsOptional, MaxLength, Min } from 'class-validator';

export class CreatePullRequestDto {
  @IsUUID()
  taskId!: string;

  @IsInt()
  @Min(1)
  number!: number;

  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  repo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  url?: string;
}
