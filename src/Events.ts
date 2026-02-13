export type CursorTool = 'none' | 'center' | 'query' | 'debugQuery' | 'info';

export interface EventsConfig {
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onOpenFile: () => void;
  onClear: () => void;
  onMoveCamera: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onSetDrawFrame: () => void;
  onUpdateCanvasSize: () => void;
}

export class Events {
  public activeCursorTool: CursorTool = 'center';

  private config: EventsConfig;

  constructor(config: EventsConfig) {
    this.config = config;
  }

  public register(): void {
    document.addEventListener('wheel', (event) => {
      event.preventDefault();
    }, { passive: false });

    window.addEventListener('resize', () => {
      this.config.onUpdateCanvasSize();
    });

    document.addEventListener('keydown', (event) => {
      this.keyEvent(event);
    });
  }

  private keyEvent(event: KeyboardEvent): void {
    this.config.onSetDrawFrame();

    switch (event.key) {
      case '1':
        this.activeCursorTool = 'none';
        break;

      case '2':
        this.activeCursorTool = 'center';
        break;

      case '3':
        this.activeCursorTool = 'info';
        break;

      case 'q':
        this.config.onRotateLeft();
        break;

      case 'w':
        this.config.onRotateRight();
        break;

      case 'o':
        this.config.onOpenFile();
        break;

      case '0':
        this.config.onClear();
        window.location.reload();
        break;

      case 'F5':
        window.location.reload();
        break;

      case 'ArrowUp':
        this.config.onMoveCamera('up');
        break;

      case 'ArrowRight':
        this.config.onMoveCamera('right');
        break;

      case 'ArrowDown':
        this.config.onMoveCamera('down');
        break;

      case 'ArrowLeft':
        this.config.onMoveCamera('left');
        break;
    }
  }
}
