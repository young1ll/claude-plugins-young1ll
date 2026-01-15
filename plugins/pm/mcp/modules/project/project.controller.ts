import { Controller } from '@nestjs/common';
import { ProjectService } from './project.service.js';
import { MCPTool } from '../../core/common/decorators/mcp-tool.decorator.js';
import { CreateProjectDto } from './dto/create-project.dto.js';

@Controller()
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @MCPTool({
    name: 'pm_project_create',
    description: 'Create a new project',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        description: { type: 'string' },
      },
      required: ['name'],
    },
  })
  async createProject(args: CreateProjectDto) {
    const project = await this.projectService.create(args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(project, null, 2),
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_project_list',
    description: 'List all active projects',
    inputSchema: {
      type: 'object',
    },
  })
  async listProjects() {
    const projects = await this.projectService.list();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(projects, null, 2),
        },
      ],
    };
  }
}
