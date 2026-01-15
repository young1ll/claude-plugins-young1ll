import { IsUUID, IsArray, ArrayMinSize } from 'class-validator';

export class AddTasksToSprintDto {
  @IsUUID()
  sprintId!: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  taskIds!: string[];
}
