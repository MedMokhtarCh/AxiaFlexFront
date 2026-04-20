import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'training_progress' })
@Index('idx_training_progress_user_unique', ['userId'], { unique: true })
export class TrainingProgress {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  userId!: string;

  @Column('jsonb', { default: () => "'{}'" })
  payload!: {
    activeModuleId?: string;
    activeStep?: number;
    doneByModule?: Record<string, number[]>;
  };

  @Column('bigint')
  updatedAt!: number;
}

