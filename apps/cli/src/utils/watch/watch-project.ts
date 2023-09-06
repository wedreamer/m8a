// Credit for this code goes to RushStack: lightwatch-plugin
import { DevLoggerService } from '@m8a/logger'

export enum WatchState {
  /** No output received yet */
  Start = 'Start',
  Building = 'Building',
  Succeeded = 'Succeeded',
  Failed = 'Failed'
}

export class WatchProject {
  public readonly name: string
  private _logger: DevLoggerService
  private _state: WatchState = WatchState.Start

  // eslint-disable-next-line no-use-before-define
  public readonly dependencies: WatchProject[] = []
  // eslint-disable-next-line no-use-before-define
  public readonly consumers: WatchProject[] = []

  private _live = false

  public readonly bufferedLines: string[] = []

  /**
   * Measures the maximum depth of the `consumers` tree, or `0` for a project with no consumers.
   *
   * See this reference for details:
   * https://github.com/microsoft/rushstack/blob/a13865bef9a20dab28c044be3504c7326bfe94b1/apps/rush-lib/src/logic/taskRunner/Task.ts#L72
   *
   * @remarks
   * `-1` means "not calculated yet"
   * `-2` means "calculation has started"
   */
  public criticalPathLength = -1

  public constructor (name: string, logger: DevLoggerService, dependencies?: WatchProject[]) {
    this.name = name
    this._logger = logger
    if (dependencies) {
      for (const dependency of dependencies) {
        this.dependencies.push(dependency)
        dependency.consumers.push(this)
      }
    } else {
      this._live = true
    }
  }

  public get state (): WatchState {
    return this._state
  }

  public get reported (): boolean {
    return this.bufferedLines.length === 0
  }

  /**
   * A project is "live" if and only if (the transitive closure of) its dependencies have `State.Succeeded`.
   */
  public get live (): boolean {
    return this._live
  }

  public setState (state: WatchState): void {
    if (this._state === state) {
      return
    }
    if (this._state === WatchState.Succeeded) {
      // If we are leaving the Succeeded state, mark all the downstream consumers as dead
      if (this._live) {
        this._markDeadRecursive()
      }
    }
    this._state = state
    if (this.state === WatchState.Succeeded) {
      // If we just entered the Succeeded state, then mark the immediate consumers as live
      if (this._live) {
        this._markLiveRecursive()
      }
    }

    if (this.state === WatchState.Building) {
      // If we just started a new build, then discard any logs accumulated from the previous iteration
      this.bufferedLines.length = 0
    }
  }

  private _markDeadRecursive (): void {
    for (const consumer of this.consumers) {
      if (consumer._live) {
        consumer._live = false
        consumer._markDeadRecursive()
      }
    }
  }

  private _markLiveRecursive (): void {
    for (const consumer of this.consumers) {
      consumer._live = true
      if (consumer._state === WatchState.Succeeded) {
        consumer._markLiveRecursive()
      }
    }
  }

  public printBufferedLines (logger: DevLoggerService): void {
    if (this.bufferedLines.length > 0) {
      for (const line of this.bufferedLines) {
        logger.logPlain(line)
      }
      this.bufferedLines.length = 0
    }
  }
}