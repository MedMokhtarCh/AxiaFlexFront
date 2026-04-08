import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'pdf_archive_entries' })
@Index('idx_pdf_archive_category_updated', ['category', 'updatedAt'])
@Index('idx_pdf_archive_relative_path', ['relativePath'], { unique: true })
export class PdfArchiveEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar', { length: 120 })
  category!: string;

  @Column('varchar', { length: 500 })
  relativePath!: string;

  @Column('varchar', { length: 255 })
  name!: string;

  @Column('int')
  size!: number;

  @Column('bigint')
  updatedAt!: number;

  @Column('bytea')
  content!: Buffer;
}
