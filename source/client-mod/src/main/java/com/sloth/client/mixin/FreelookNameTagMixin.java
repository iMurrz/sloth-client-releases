package com.sloth.client.mixin;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.CameraModules;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.world.entity.Avatar;
import net.minecraft.world.scores.Team;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(AvatarRenderer.class)
abstract class FreelookNameTagMixin {
    @Inject(method="shouldShowName(Lnet/minecraft/world/entity/Avatar;D)Z",at=@At("RETURN"),cancellable=true)
    private void sloth$ownFreelookName(Avatar avatar,double distance,CallbackInfoReturnable<Boolean> result) {
        Minecraft mc=Minecraft.getInstance();
        if(avatar!=mc.player || !ModuleManager.get(CameraModules.Freelook.class).looking())return;
        Team team=avatar.getTeam();
        boolean teamAllows=team==null || (team.getNameTagVisibility()!=Team.Visibility.NEVER
            && team.getNameTagVisibility()!=Team.Visibility.HIDE_FOR_OWN_TEAM);
        result.setReturnValue(Minecraft.renderNames() && !avatar.isInvisible() && !avatar.isVehicle()
            && distance<4096 && (!avatar.isDiscrete() || distance<1024) && teamAllows);
    }
}
