import { afterEach, describe, expect, it, vi } from "vitest";
import { cueFor } from "@cc/ui";
import { createBrowserCuePlayer } from "../src/mock/cue-player";
import { createBrowserPreferenceController } from "../src/guardian-settings";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createBrowserCuePlayer", () => {
  it("plays the cue sound and maps optional haptics", () => {
    const play = vi.fn();
    const createAudio = vi.fn(() => ({ play }));
    const vibrate = vi.fn();
    const player = createBrowserCuePlayer({ createAudio, vibrate });

    player.play(cueFor("correct"));
    player.play(cueFor("segmentClear"));

    expect(createAudio).toHaveBeenNthCalledWith(1, "correct");
    expect(createAudio).toHaveBeenNthCalledWith(2, "chest");
    expect(play).toHaveBeenCalledTimes(2);
    expect(vibrate).toHaveBeenNthCalledWith(1, 10);
    expect(vibrate).toHaveBeenNthCalledWith(2, 20);
  });

  it("does not vibrate for a wrong answer", () => {
    const vibrate = vi.fn();
    const player = createBrowserCuePlayer({ vibrate });

    player.play(cueFor("wrong"));

    expect(vibrate).not.toHaveBeenCalled();
  });

  it("consults current sound and haptic preferences for every cue", () => {
    const play = vi.fn();
    const createAudio = vi.fn(() => ({ play }));
    const vibrate = vi.fn();
    const preferences = createBrowserPreferenceController();
    const player = createBrowserCuePlayer(
      { createAudio, vibrate },
      preferences,
    );

    preferences.setAnswerSoundEnabled(false);
    player.play(cueFor("correct"));
    expect(createAudio).not.toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledWith(10);

    vibrate.mockClear();
    preferences.setAnswerSoundEnabled(true);
    preferences.setHapticsEnabled(false);
    player.play(cueFor("segmentClear"));
    expect(createAudio).toHaveBeenCalledWith("chest");
    expect(play).toHaveBeenCalledTimes(1);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("silently handles missing browser audio and vibration capabilities", () => {
    vi.stubGlobal("Audio", undefined);
    vi.stubGlobal("navigator", undefined);

    const player = createBrowserCuePlayer();

    expect(() => player.play(cueFor("correct"))).not.toThrow();
  });

  it("silently handles audio construction and synchronous playback failures", () => {
    const constructionFailure = createBrowserCuePlayer({
      createAudio: () => {
        throw new Error("audio unavailable");
      },
    });
    const playbackFailure = createBrowserCuePlayer({
      createAudio: () => ({
        play: () => {
          throw new Error("playback unavailable");
        },
      }),
    });

    expect(() => constructionFailure.play(cueFor("correct"))).not.toThrow();
    expect(() => playbackFailure.play(cueFor("correct"))).not.toThrow();
  });

  it("silently handles rejected playback", async () => {
    const player = createBrowserCuePlayer({
      createAudio: () => ({
        play: () => Promise.reject(new Error("autoplay blocked")),
      }),
    });

    expect(() => player.play(cueFor("correct"))).not.toThrow();
    await Promise.resolve();
  });

  it("silently handles vibration failures", () => {
    const player = createBrowserCuePlayer({
      vibrate: () => {
        throw new Error("vibration unavailable");
      },
    });

    expect(() => player.play(cueFor("correct"))).not.toThrow();
  });
});
