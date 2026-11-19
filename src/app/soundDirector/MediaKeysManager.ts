import type {SoundMix} from "./soundMix.ts";
import {MixDesk} from "./mixDesk.ts";
import {SoundSnapshot} from "./soundSnapshot.ts";

// one minute of silence as a base64 encoded mp3, used by the fake audio element to trick the
// browser into allowing media session & media keys.
import base64EncodedSilence from '../assets/silence.base64.txt?raw';

export default class MediaKeysManager {
    private fakeAudio?: HTMLAudioElement | null;

    constructor(private desk: MixDesk, private readonly deps: { pressNext: () => void; pressPrevious: () => void }) {
        this.bindMediaControls();
    }
    
    public syncMediaKeys(mix: SoundMix, current: SoundSnapshot) {
        if (!('mediaSession' in navigator)) {
            return;
        }
        
        if (!this.fakeAudio) {
            this.mountFakeAudioElement();
        }

        if(!current.mix.table.silenced){
            void this.fakeAudio?.play();
            navigator.mediaSession.playbackState = 'playing';
        } else {
            this.fakeAudio?.pause();
            navigator.mediaSession.playbackState = 'paused';
        }

        if (mix.table.layers.length == 0){
            // unmount the fake audio element if is nothing playing (no layers in the mix)
            this.fakeAudio?.remove();
            this.fakeAudio = null;
            navigator.mediaSession.playbackState = 'none';
        }

    }
    
    // media controls requires an <audio> element to be present in the DOM, so we mount one that plays a minute of silence
    // on a loop to trick the browser into allowing media controls, which we intercept to control the actual mix.
    // We mount the fake audio element only once the mix starts playing, and unmount it when the mix is cleared. This
    // ensures the media controls only control Obsidian/Atlas when there is actually a mix to play.
    private mountFakeAudioElement() {
        if (!('mediaSession' in navigator)) {
            return;
        }
        
        this.fakeAudio = document.body.createEl('audio');
        this.fakeAudio.setAttr('loop', true);
        this.fakeAudio.setAttr('muted', true);
        this.fakeAudio.setAttr('src', base64EncodedSilence)

        navigator.mediaSession.playbackState = "paused";
    }

    private bindMediaControls(){
        if (!('mediaSession' in navigator)) {
            return;
        }
        navigator.mediaSession.setActionHandler("play", () => {
            this.desk.setSilence(false);
        });

        navigator.mediaSession.setActionHandler("pause", () => {
            this.desk.setSilence(true);
        });

        navigator.mediaSession.setActionHandler("nexttrack", () => {
            this.deps.pressNext();
        });

        navigator.mediaSession.setActionHandler("previoustrack", () => {
            this.deps.pressPrevious();
        })
    }

}