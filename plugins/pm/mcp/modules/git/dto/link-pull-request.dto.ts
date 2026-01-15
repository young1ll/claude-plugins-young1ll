import { IsUUID, IsInt, Min } from 'class-validator';

export class LinkPullRequestDto {
  @IsUUID()
  taskId!: string;

  @IsInt()
  @Min(1)
  prNumber!: number;
}
